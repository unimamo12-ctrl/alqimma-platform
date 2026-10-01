import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import type { QuizDraftInput } from '@/lib/validation/quiz';
import { totalPoints } from '@/lib/validation/quiz';
import { getQuiz, QuizError } from '@/lib/quiz/service';

type Tx = Prisma.TransactionClient;

/**
 * Expands the teacher's target selection into concrete student ids.
 * `courseWide` means "everyone enrolled in the section", which is stored as
 * explicit rows so the audit trail of who was targeted survives the course
 * changing later.
 */
export async function resolveAssignmentTargets(
  courseId: string,
  studentIds: string[],
  courseWide: boolean,
): Promise<string[]> {
  if (!courseWide) return [...new Set(studentIds)];

  const enrolled = await prisma.enrollment.findMany({
    where: { courseId },
    select: { studentId: true },
  });

  return [...new Set([...enrolled.map((row) => row.studentId), ...studentIds])];
}

/**
 * A student can only be targeted through a quiz of a course they are enrolled
 * in. Cheating here would let a teacher hand out a quiz to somebody outside the
 * section, and would also break the student-side "my quizzes" list.
 */
export async function assertStudentsEnrolled(
  courseId: string,
  studentIds: string[],
): Promise<void> {
  const unique = [...new Set(studentIds)];
  if (unique.length === 0) return;

  const enrolled = await prisma.enrollment.findMany({
    where: { courseId, studentId: { in: unique } },
    select: { studentId: true },
  });

  const ok = new Set(enrolled.map((row) => row.studentId));
  const missing = unique.filter((studentId) => !ok.has(studentId));

  if (missing.length > 0) {
    throw new QuizError(
      'أحد الطلاب المحددين غير مسجّل في هذه الدورة. اختر طلابًا من سجل الدورة.',
      400,
    );
  }
}

async function replaceQuestions(tx: Tx, quizId: string, questions: QuizDraftInput['questions']) {
  // safe because callers forbid editing once an attempt exists
  await tx.quizQuestion.deleteMany({ where: { quizId } });

  for (const [index, question] of questions.entries()) {
    await tx.quizQuestion.create({
      data: {
        quizId,
        type: question.type,
        text: question.text,
        imageUrl: question.imageUrl || null,
        points: question.points,
        order: index,
        isRequired: question.isRequired,
        requiresManualGrading: question.requiresManualGrading,
        modelAnswer: question.modelAnswer ?? null,
        matchValue: question.matchValue?.trim() ? question.matchValue.trim() : null,
        matchMode: question.matchValue ? (question.matchMode ?? 'EXACT') : null,
        options:
          question.type === 'MULTIPLE_CHOICE'
            ? {
                create: question.options.map((option, optionIndex) => ({
                  text: option.text,
                  imageUrl: option.imageUrl || null,
                  isCorrect: option.isCorrect === true,
                  order: optionIndex,
                })),
              }
            : undefined,
      },
    });
  }
}

/**
 * Syncs the assignment rows to the requested target list, with one rule that
 * overrides the teacher's selection: a student who already has an attempt keeps
 * their row forever, otherwise archiving or reassigning a quiz would erase the
 * evidence of work that was really done.
 */
async function replaceAssignments(tx: Tx, quizId: string, studentIds: string[]) {
  const existing = await tx.quizAssignment.findMany({
    where: { quizId },
    select: { studentId: true },
  });

  const taken = new Set(
    (
      await tx.quizAttempt.findMany({
        where: { quizId, studentId: { in: existing.map((row) => row.studentId) } },
        select: { studentId: true },
        distinct: ['studentId'],
      })
    ).map((row) => row.studentId),
  );

  const removable = existing
    .map((row) => row.studentId)
    .filter((studentId) => !taken.has(studentId));

  if (removable.length > 0) {
    await tx.quizAssignment.deleteMany({
      where: { quizId, studentId: { in: removable } },
    });
  }

  // `already` must only cover the rows that survived the delete above. Reading it
  // from `existing` would make every student the teacher kept selected look like
  // they were already assigned, so their row would be deleted and never
  // recreated and saving a quiz would silently unassign the whole class.
  const preserved = existing
    .map((row) => row.studentId)
    .filter((studentId) => taken.has(studentId));
  const already = new Set(preserved);
  const toCreate = [...new Set(studentIds)].filter((studentId) => !already.has(studentId));

  if (toCreate.length > 0) {
    await tx.quizAssignment.createMany({
      data: toCreate.map((studentId) => ({ quizId, studentId })),
      skipDuplicates: true,
    });
  }
}

export type WriteOptions = {
  teacherId: string;
  studentIds: string[];
  courseWide: boolean;
};

function frozenQuestionsError() {
  return new QuizError(
    'لا يمكن تعديل أسئلة هذا الاختبار بعد بدء التلاميذ لمحاولاتهم. يمكنك أرشفته وإنشاء نسخة جديدة.',
    409,
  );
}

/**
 * Creates or updates a quiz and replaces its questions/assignments in one
 * transaction.
 *
 * Questions freeze on the first attempt, not on publication: a quiz that is
 * already handed out but untouched by any student stays fully editable. The
 * check lives in here rather than in the route so no caller can write questions
 * past that point, and it throws instead of quietly discarding them.
 */
export async function writeQuizDraft(
  quizId: string | null,
  input: QuizDraftInput,
  options: WriteOptions,
) {
  const targetIds = await resolveAssignmentTargets(
    input.courseId,
    options.studentIds,
    options.courseWide,
  );

  await assertStudentsEnrolled(input.courseId, targetIds);

  const points = totalPoints(input.questions);

  return prisma.$transaction(async (tx) => {
    const settings = {
      title: input.title,
      description: input.description ?? null,
      durationMin: input.durationMin,
      maxAttempts: input.maxAttempts,
      gradingPolicy: input.gradingPolicy,
      allowNavigation: input.allowNavigation,
      shuffleQuestions: input.shuffleQuestions,
      showCorrectAnswers: input.showCorrectAnswers,
      opensAt: input.opensAt ? new Date(input.opensAt) : null,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      totalPoints: points,
    };

    const quiz = quizId
      ? await tx.quiz.update({ where: { id: quizId }, data: settings })
      : await tx.quiz.create({
          data: {
            ...settings,
            courseId: input.courseId,
            teacherId: options.teacherId,
            status: 'DRAFT',
          },
        });

    if (quizId) {
      const attemptsStarted = await tx.quizAttempt.count({ where: { quizId } });
      if (attemptsStarted > 0) throw frozenQuestionsError();
    }

    await replaceQuestions(tx, quiz.id, input.questions);
    await replaceAssignments(tx, quiz.id, targetIds);

    return quiz;
  });
}

/**
 * Standalone assignment update used by the editor's assign panel. Shares the
 * same rules as saving a draft: enrolment is enforced, and students who already
 * have an attempt keep their row.
 */
export async function syncQuizAssignments(
  quizId: string,
  courseId: string,
  studentIds: string[],
  courseWide: boolean,
) {
  const targets = await resolveAssignmentTargets(courseId, studentIds, courseWide);

  if (targets.length === 0) {
    throw new QuizError('حدّد تلميذين على الأقل', 400);
  }

  await assertStudentsEnrolled(courseId, targets);

  return prisma.$transaction(async (tx) => {
    await replaceAssignments(tx, quizId, targets);
    return prisma.quizAssignment.count({ where: { quizId } });
  });
}

export async function assertNoAttemptsStarted(quizId: string) {
  const count = await prisma.quizAttempt.count({ where: { quizId } });
  if (count > 0) throw frozenQuestionsError();
  return count;
}

export async function assertQuestionsPresent(quizId: string) {
  const quiz = await getQuiz(quizId);
  if (!quiz) throw new QuizError('الاختبار غير موجود', 404);
  if (quiz.questions.length === 0) {
    throw new QuizError('أضف سؤالًا واحدًا على الأقل قبل النشر', 400);
  }
  return quiz;
}
