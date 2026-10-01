import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, notFound } from '@/lib/auth/guards';
import { ownsQuiz, quizErrorResponse } from '@/lib/quiz/access';
import { computeGrade, loadGradeContext, toGradeable } from '@/lib/quiz/grading';
import { QuizError } from '@/lib/quiz/service';

type Params = { params: Promise<{ id: string }> };

const gradeSchema = z.object({
  attemptId: z.string().min(1),
  grades: z
    .array(
      z.object({
        questionId: z.string().min(1),
        isCorrect: z.boolean(),
        pointsAwarded: z.number().min(0).nullable().optional(),
        feedback: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .min(1),
});

/**
 * POST /api/quizzes/[id]/manual-grading
 * The teacher resolves every pending free-text answer for one attempt. Scores
 * are recomputed on the server, so the client never dictates a total.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!(await ownsQuiz(session, id))) return notFound('الاختبار غير موجود');

    const body = await request.json();
    const parsed = gradeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const { attemptId, grades } = parsed.data;

    const attempt = await loadGradeContext(attemptId);
    if (!attempt || attempt.quizId !== id) throw new QuizError('المحاولة غير موجودة', 404);

    if (attempt.status === 'IN_PROGRESS') {
      throw new QuizError('لا يمكن تصحيح محاولة لم تنتهِ بعد', 409);
    }

    const questionsById = new Map(attempt.quiz.questions.map((q) => [q.id, q]));

    for (const grade of grades) {
      const question = questionsById.get(grade.questionId);
      if (!question) throw new QuizError('سؤال غير موجود في هذا الاختبار', 400);

      // only free-text answers can be corrected by hand
      if (question.type !== 'TEXT') {
        throw new QuizError('يُصحَّح سؤال الاختيار من متعدد تلقائيًا', 400);
      }

      const answered = attempt.answers.some((row) => row.questionId === grade.questionId);
      if (!answered) {
        throw new QuizError('لا يوجد رد مسجل لهذا السؤال', 400);
      }

      const points = grade.pointsAwarded ?? (grade.isCorrect ? question.points : 0);
      if (points > question.points) {
        throw new QuizError(
          `النقاط لا يمكن أن تتجاوز ${question.points} لهذا السؤال`,
          400,
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const grade of grades) {
        const question = questionsById.get(grade.questionId);
        if (!question) continue;

        const points = grade.pointsAwarded ?? (grade.isCorrect ? question.points : 0);

        await tx.quizAnswer.update({
          where: { attemptId_questionId: { attemptId, questionId: grade.questionId } },
          data: {
            isCorrect: grade.isCorrect,
            pointsAwarded: points,
            feedback: grade.feedback ?? null,
          },
        });
      }

      // recompute from the stored verdicts so totals can never drift from the
      // answers, and so the attempt finally leaves PENDING_REVIEW
      const reloaded = await loadGradeContext(attemptId, tx);
      if (!reloaded) throw new QuizError('المحاولة غير موجودة', 404);

      const outcome = computeGrade(toGradeable(reloaded), reloaded.answers);

      return {
        outcome,
        attempt: await tx.quizAttempt.update({
          where: { id: attemptId },
          data: {
            scorePoints: outcome.scorePoints,
            maxPoints: outcome.maxPoints,
            correctCount: outcome.correctCount,
            wrongCount: outcome.wrongCount,
            unansweredCount: outcome.unansweredCount,
            percentage: outcome.percentage,
            requiresManualGrading: outcome.requiresManualGrading,
            status: outcome.requiresManualGrading ? 'PENDING_REVIEW' : 'GRADED',
            gradedAt: outcome.requiresManualGrading ? null : new Date(),
          },
        }),
      };
    });

    const { outcome, attempt: finalAttempt } = updated;

    return NextResponse.json({
      success: true,
      message: outcome.requiresManualGrading
        ? 'تم حفظ التصحيح، ما زالت هناك إجابات بانتظار المراجعة'
        : 'تم اعتماد النتيجة النهائية',
      data: {
        attempt: {
          id: finalAttempt.id,
          status: finalAttempt.status,
          scorePoints: finalAttempt.scorePoints,
          percentage: finalAttempt.percentage,
          requiresManualGrading: finalAttempt.requiresManualGrading,
        },
      },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
