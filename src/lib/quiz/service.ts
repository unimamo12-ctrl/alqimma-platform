import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { toGradedQuestion } from '@/lib/quiz/serialize';
import {
  attemptDeadline,
  averageScore,
  canStartAttempt,
  isAttemptExpired,
  quizWindow,
  resolveQuizStatus,
  round2,
  selectFinalAttempt,
  type QuizStatusCounts,
} from '@/lib/quiz/status';
import { computeGrade, loadGradeContext, toGradeable } from '@/lib/quiz/grading';

export const quizInclude = {
  questions: { orderBy: { order: 'asc' as const }, include: { options: true } },
  course: { select: { id: true, title: true, isPublished: true } },
} satisfies Prisma.QuizInclude;

export async function getQuiz(quizId: string) {
  return prisma.quiz.findUnique({ where: { id: quizId }, include: quizInclude });
}

export async function getQuizCounts(
  quizId: string,
  maxAttempts?: number,
): Promise<QuizStatusCounts> {
  const limit =
    maxAttempts ??
    (
      await prisma.quiz.findUnique({ where: { id: quizId }, select: { maxAttempts: true } })
    )?.maxAttempts ??
    1;

  const [assignments, attempts] = await Promise.all([
    prisma.quizAssignment.findMany({ where: { quizId }, select: { studentId: true } }),
    prisma.quizAttempt.findMany({
      where: { quizId },
      select: { studentId: true, status: true },
    }),
  ]);

  const perStudent = new Map<string, { used: number; running: boolean; finished: boolean }>();

  for (const attempt of attempts) {
    const entry = perStudent.get(attempt.studentId) ?? {
      used: 0,
      running: false,
      finished: false,
    };
    entry.used += 1;
    if (attempt.status === 'IN_PROGRESS') entry.running = true;
    else entry.finished = true;
    perStudent.set(attempt.studentId, entry);
  }

  const openStudents = assignments.filter(({ studentId }) => {
    const entry = perStudent.get(studentId);
    if (entry?.running) return true;
    return (entry?.used ?? 0) < limit;
  }).length;

  return {
    assigned: assignments.length,
    inProgress: attempts.filter((attempt) => attempt.status === 'IN_PROGRESS').length,
    submittedStudents: [...perStudent.values()].filter((entry) => entry.finished).length,
    openStudents,
  };
}

export async function effectiveStatus(quizId: string, now = new Date()) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      status: true,
      opensAt: true,
      closesAt: true,
      maxAttempts: true,
    },
  });

  if (!quiz) return null;

  const counts = await getQuizCounts(quizId, quiz.maxAttempts);
  return resolveQuizStatus(quiz, counts, now);
}

export type FinalizeReason = 'SUBMITTED' | 'TIME_EXPIRED' | 'ARCHIVED';

/**
 * Grades an attempt and closes it.
 *
 * The move out of IN_PROGRESS is a compare-and-set inside the transaction, so a
 * student hitting submit at the same moment the deadline passes produces exactly
 * one grade instead of two racing writers.
 */
export async function finalizeAttempt(attemptId: string, reason: FinalizeReason) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const context = await loadGradeContext(attemptId, tx);
    if (!context) throw new QuizError('المحاولة غير موجودة', 404);

    const claimed = await tx.quizAttempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: { status: 'SUBMITTED' },
    });

    if (claimed.count === 0) {
      return { attempt: context, alreadyFinal: true as const };
    }

    // an attempt cut short by its deadline is recorded as ending at the
    // deadline, not at the moment the student happened to come back
    const endedAt =
      reason !== 'SUBMITTED' && context.expiresAt && context.expiresAt < now
        ? context.expiresAt
        : now;

    const durationSec = Math.max(
      0,
      Math.round((endedAt.getTime() - context.startedAt.getTime()) / 1000),
    );

    const outcome = computeGrade(toGradeable(context), context.answers);

    for (const [questionId, verdict] of outcome.perAnswer) {
      const existing = context.answers.find((answer) => answer.questionId === questionId);
      if (!existing) continue;
      if (existing.isCorrect === verdict.isCorrect) continue;

      await tx.quizAnswer.update({
        where: { id: existing.id },
        data: { isCorrect: verdict.isCorrect, pointsAwarded: verdict.pointsAwarded },
      });
    }

    const updated = await tx.quizAttempt.update({
      where: { id: attemptId },
      data: {
        status: outcome.requiresManualGrading ? 'PENDING_REVIEW' : 'GRADED',
        submittedAt: endedAt,
        durationSec,
        scorePoints: outcome.scorePoints,
        maxPoints: outcome.maxPoints,
        correctCount: outcome.correctCount,
        wrongCount: outcome.wrongCount,
        unansweredCount: outcome.unansweredCount,
        percentage: outcome.percentage,
        requiresManualGrading: outcome.requiresManualGrading,
        gradedAt: outcome.requiresManualGrading ? null : now,
      },
      include: { answers: true },
    });

    return { attempt: updated, alreadyFinal: false as const };
  });
}

/**
 * Closes any attempt whose deadline passed. Called on student reads so a
 * student who closed the tab still ends up with a graded result.
 */
export async function sweepExpiredAttempts(quizId: string, studentId: string) {
  const open = await prisma.quizAttempt.findMany({
    where: { quizId, studentId, status: 'IN_PROGRESS' },
    select: { id: true, expiresAt: true },
  });

  const now = new Date();
  const closed: string[] = [];

  for (const attempt of open) {
    if (isAttemptExpired(attempt.expiresAt, now)) {
      await finalizeAttempt(attempt.id, 'TIME_EXPIRED');
      closed.push(attempt.id);
    }
  }

  return closed;
}

/**
 * Opens a new attempt or hands back the one already running. Every limit is
 * re-checked here on the server; the client never gets to decide.
 */
export async function beginAttempt(quizId: string, studentId: string) {
  await sweepExpiredAttempts(quizId, studentId);

  const quiz = await getQuiz(quizId);
  if (!quiz) throw new QuizError('الاختبار غير موجود', 404);

  if (!(await isAssignedToStudent(quizId, studentId))) {
    throw new QuizError('هذا الاختبار غير مُسند إليك', 403);
  }

  // publication and time limits gate everything, including resuming
  if (quiz.status === 'DRAFT') throw new QuizError('الاختبار لم يُنشر بعد', 409);
  if (quiz.status === 'ARCHIVED') throw new QuizError('هذا الاختبار مؤرشف', 409);

  const window = quizWindow(quiz);
  if (window.notYetOpen) throw new QuizError('لم يبدأ وقت هذا الاختبار بعد', 409);
  if (window.closed) throw new QuizError('انتهى وقت هذا الاختبار', 409);

  // an attempt already in flight belongs to the student, so hand it back before
  // the allowance is counted: the running attempt is the one that counts
  const running = await prisma.quizAttempt.findFirst({
    where: { quizId, studentId, status: 'IN_PROGRESS' },
    include: { answers: true },
  });

  if (running) {
    return { attempt: running, resumed: true as const };
  }

  const counts = await getQuizCounts(quizId, quiz.maxAttempts);
  const status = resolveQuizStatus(quiz, counts);

  const used = await prisma.quizAttempt.count({ where: { quizId, studentId } });
  const gate = canStartAttempt(quiz, status, used);

  if (!gate.ok) throw new QuizError(gate.reason, 409);

  const startedAt = new Date();
  const expiresAt = attemptDeadline(quiz, startedAt);

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId,
      studentId,
      attemptNumber: used + 1,
      status: 'IN_PROGRESS',
      startedAt,
      expiresAt,
      maxPoints: quiz.totalPoints,
    },
    include: { answers: true },
  });

  return { attempt, resumed: false as const };
}

export async function isAssignedToStudent(quizId: string, studentId: string) {
  const row = await prisma.quizAssignment.findUnique({
    where: { quizId_studentId: { quizId, studentId } },
    select: { studentId: true },
  });
  return Boolean(row);
}

export async function recordAnswer(
  attemptId: string,
  studentId: string,
  input: { questionId: string; selectedOptionId?: string | null; textAnswer?: string | null },
) {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { select: { id: true, totalPoints: true } } },
  });

  if (!attempt) throw new QuizError('المحاولة غير موجودة', 404);
  if (attempt.studentId !== studentId) throw new QuizError('غير مصرح', 403);
  if (attempt.status !== 'IN_PROGRESS') {
    throw new QuizError('انتهت المحاولة ولا يمكن تعديل الإجابات', 409);
  }

  if (isAttemptExpired(attempt.expiresAt)) {
    await finalizeAttempt(attempt.id, 'TIME_EXPIRED');
    throw new QuizError('انتهى وقت المحاولة', 409);
  }

  const question = await prisma.quizQuestion.findFirst({
    where: { id: input.questionId, quizId: attempt.quizId },
    include: { options: true },
  });

  if (!question) throw new QuizError('السؤال غير موجود', 404);

  const selectedOptionId = input.selectedOptionId ?? null;
  const textAnswer = input.textAnswer?.trim() ? input.textAnswer.trim() : null;

  if (question.type === 'MULTIPLE_CHOICE') {
    if (selectedOptionId) {
      const valid = question.options.some((option) => option.id === selectedOptionId);
      if (!valid) throw new QuizError('الخيار غير موجود', 400);
    }
    if (textAnswer) throw new QuizError('هذا السؤال لا يقبل إجابة نصية', 400);
  } else {
    if (selectedOptionId) throw new QuizError('هذا السؤال لا يقبل اختيارًا', 400);
    if (textAnswer && textAnswer.length > 5000) {
      throw new QuizError('الإجابة طويلة جدًا', 400);
    }
  }

  const cleared =
    question.type === 'MULTIPLE_CHOICE' ? !selectedOptionId : !textAnswer;

  const answer = await prisma.quizAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId: question.id } },
    create: {
      attemptId,
      questionId: question.id,
      selectedOptionId,
      textAnswer,
    },
    update: cleared
      ? { selectedOptionId: null, textAnswer: null, isCorrect: null, pointsAwarded: null }
      : { selectedOptionId, textAnswer },
  });

  return answer;
}

/**
 * Builds the student's official result: the attempt chosen by the grading
 * policy, plus a per-question breakdown. `revealAnswers` is only true when the
 * teacher enabled it and the window has closed, so nobody can mine the result
 * page while other students are still answering.
 */
export async function buildStudentResult(quizId: string, studentId: string) {
  const quiz = await getQuiz(quizId);
  if (!quiz) return null;

  const counts = await getQuizCounts(quizId, quiz.maxAttempts);
  const status = resolveQuizStatus(quiz, counts);

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId, studentId },
    include: { answers: true },
    orderBy: { attemptNumber: 'asc' },
  });

  const finalAttempt = selectFinalAttempt(attempts, quiz.gradingPolicy);
  const graded = attempts.filter(
    (attempt) => attempt.status !== 'IN_PROGRESS' && !attempt.requiresManualGrading,
  );
  const averagePercentage = averageScore(attempts);

  const windowClosed = Boolean(quiz.closesAt && new Date() >= quiz.closesAt);

  // the answer key stays hidden while anybody assigned still has an attempt to
  // run, whether or not they have started it yet
  const revealAnswers = quiz.showCorrectAnswers && (windowClosed || counts.openStudents === 0);

  const official = finalAttempt
    ? quiz.gradingPolicy === 'AVERAGE' && graded.length > 0
      ? {
          attemptId: finalAttempt.id,
          attemptNumber: finalAttempt.attemptNumber,
          scorePoints: round2(
            graded.reduce((sum, attempt) => sum + attempt.scorePoints, 0) / graded.length,
          ),
          maxPoints: finalAttempt.maxPoints,
          correctCount: finalAttempt.correctCount,
          wrongCount: finalAttempt.wrongCount,
          unansweredCount: finalAttempt.unansweredCount,
          percentage: averagePercentage,
          durationSec: Math.round(
            graded.reduce((sum, attempt) => sum + attempt.durationSec, 0) / graded.length,
          ),
          averagePercentage,
          submittedAt: iso(finalAttempt.submittedAt),
        }
      : {
          attemptId: finalAttempt.id,
          attemptNumber: finalAttempt.attemptNumber,
          scorePoints: finalAttempt.scorePoints,
          maxPoints: finalAttempt.maxPoints,
          correctCount: finalAttempt.correctCount,
          wrongCount: finalAttempt.wrongCount,
          unansweredCount: finalAttempt.unansweredCount,
          percentage: finalAttempt.percentage,
          durationSec: finalAttempt.durationSec,
          averagePercentage,
          submittedAt: iso(finalAttempt.submittedAt),
        }
    : null;

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status,
      totalPoints: quiz.totalPoints,
      maxAttempts: quiz.maxAttempts,
      gradingPolicy: quiz.gradingPolicy,
      showCorrectAnswers: quiz.showCorrectAnswers,
      closesAt: iso(quiz.closesAt),
    },
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: iso(attempt.startedAt),
      submittedAt: iso(attempt.submittedAt),
      durationSec: attempt.durationSec,
      scorePoints: attempt.scorePoints,
      maxPoints: attempt.maxPoints,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      unansweredCount: attempt.unansweredCount,
      percentage: attempt.percentage,
      requiresManualGrading: attempt.requiresManualGrading,
      isFinal: finalAttempt?.id === attempt.id,
    })),
    attemptsUsed: attempts.length,
    attemptsRemaining: Math.max(0, quiz.maxAttempts - attempts.length),
    revealAnswers,
    official,
    // per-question review, only when the answer key is allowed to be shown
    breakdown:
      revealAnswers && finalAttempt
        ? quiz.questions.map((question) =>
            toGradedQuestion(
              question,
              finalAttempt.answers.filter((answer) => answer.questionId === question.id),
              true,
            ),
          )
        : null,
  };
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export class QuizError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'QuizError';
    this.status = status;
  }
}

export function round(value: number) {
  return round2(value);
}
