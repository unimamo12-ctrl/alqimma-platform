import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { round2 } from '@/lib/quiz/status';

/**
 * Arabic-tolerant normalisation so "الجبر" and "الجَبْر" and "الجبر " compare
 * equal when the teacher opted into auto-grading a text answer.
 */
export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[.,!?؛،:()"'\[\]{}\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type GradeableQuestion = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TEXT';
  points: number;
  requiresManualGrading: boolean;
  modelAnswer: string | null;
  matchValue: string | null;
  matchMode: string | null;
  options: { id: string; isCorrect: boolean }[];
};

export type SubmittedAnswer = {
  questionId: string;
  selectedOptionId: string | null;
  textAnswer: string | null;
  /**
   * verdict a teacher already recorded for this answer, if any. Re-grading must
   * not throw that away, otherwise manual correction could never leave
   * PENDING_REVIEW.
   */
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
};

export type GradeOutcome = {
  scorePoints: number;
  maxPoints: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  percentage: number;
  requiresManualGrading: boolean;
  perAnswer: Map<string, { isCorrect: boolean | null; pointsAwarded: number | null }>;
};

/**
 * Pure grading pass. Unanswered questions are counted separately from wrong
 * ones, and anything the teacher must read by hand stays `null` instead of
 * being silently marked wrong.
 */
export function computeGrade(
  questions: GradeableQuestion[],
  submitted: SubmittedAnswer[],
): GradeOutcome {
  const byQuestion = new Map(submitted.map((a) => [a.questionId, a]));
  const perAnswer = new Map<string, { isCorrect: boolean | null; pointsAwarded: number | null }>();

  let scorePoints = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let requiresManualGrading = false;
  const maxPoints = questions.reduce((sum, q) => sum + q.points, 0);

  const settle = (question: GradeableQuestion, isCorrect: boolean, points: number) => {
    perAnswer.set(question.id, { isCorrect, pointsAwarded: points });
    if (isCorrect) {
      correctCount += 1;
      scorePoints += points;
    } else {
      wrongCount += 1;
    }
  };

  for (const question of questions) {
    const answer = byQuestion.get(question.id);
    const hasChoice = Boolean(answer?.selectedOptionId);
    const hasText = Boolean(answer?.textAnswer && answer.textAnswer.trim().length > 0);

    if (!answer || (!hasChoice && !hasText)) {
      unansweredCount += 1;
      perAnswer.set(question.id, { isCorrect: null, pointsAwarded: null });
      continue;
    }

    if (question.type === 'MULTIPLE_CHOICE') {
      const chosen = question.options.find((o) => o.id === answer.selectedOptionId);
      settle(question, Boolean(chosen?.isCorrect), chosen?.isCorrect ? question.points : 0);
      continue;
    }

    if (question.matchValue) {
      // auto-gradable free text
      const normalized = normalizeText(answer.textAnswer ?? '');
      const expected = normalizeText(question.matchValue);
      const isCorrect =
        question.matchMode === 'CONTAINS'
          ? normalized.includes(expected)
          : normalized === expected;
      settle(question, isCorrect, isCorrect ? question.points : 0);
      continue;
    }

    // free text with no answer key: the teacher's stored verdict wins, and only
    // a still-undecided answer keeps the attempt in PENDING_REVIEW
    if (answer.isCorrect === true || answer.isCorrect === false) {
      const points = answer.pointsAwarded ?? (answer.isCorrect ? question.points : 0);
      settle(question, answer.isCorrect, points);
      continue;
    }

    requiresManualGrading = true;
    perAnswer.set(question.id, { isCorrect: null, pointsAwarded: null });
  }

  const percentage = maxPoints > 0 ? round2((scorePoints / maxPoints) * 100) : 0;

  return {
    scorePoints: round2(scorePoints),
    maxPoints,
    correctCount,
    wrongCount,
    unansweredCount,
    percentage,
    requiresManualGrading,
    perAnswer,
  };
}

/**
 * Loads an attempt with everything grading needs. Kept separate so the same
 * shape can be used by submit, time-expiry and manual-correction paths.
 */
export async function loadGradeContext(
  attemptId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const attempt = await client.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { options: true },
          },
        },
      },
    },
  });

  return attempt;
}

export function toGradeable(attempt: NonNullable<Awaited<ReturnType<typeof loadGradeContext>>>) {
  return attempt.quiz.questions.map<GradeableQuestion>((question) => ({
    id: question.id,
    type: question.type,
    points: question.points,
    requiresManualGrading: question.requiresManualGrading && !question.matchValue,
    modelAnswer: question.modelAnswer,
    matchValue: question.matchValue,
    matchMode: question.matchMode,
    options: question.options.map((option) => ({
      id: option.id,
      isCorrect: option.isCorrect,
    })),
  }));
}
