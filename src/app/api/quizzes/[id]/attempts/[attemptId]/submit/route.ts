import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireStudent, quizErrorResponse } from '@/lib/quiz/access';
import { isAttemptExpired } from '@/lib/quiz/status';
import { finalizeAttempt, QuizError } from '@/lib/quiz/service';

type Params = { params: Promise<{ id: string; attemptId: string }> };

/**
 * POST /api/quizzes/[id]/attempts/[attemptId]/submit
 * Ends the attempt and grades it. Idempotent, so a double click or a retry after
 * a timeout cannot grade twice. A missed deadline is closed here too, with the
 * same "time expired" path the sweeper would have used.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id, attemptId } = await params;
    const guard = await requireStudent();
    if (!guard.ok) return guard.response;
    const studentId = guard.session.student.id;

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, quizId: true, studentId: true, status: true, expiresAt: true },
    });

    if (!attempt || attempt.quizId !== id) throw new QuizError('المحاولة غير موجودة', 404);
    if (attempt.studentId !== studentId) throw new QuizError('غير مصرح', 403);

    const expired = isAttemptExpired(attempt.expiresAt);
    const { attempt: finalized, alreadyFinal } = await finalizeAttempt(
      attempt.id,
      expired ? 'TIME_EXPIRED' : 'SUBMITTED',
    );

    return NextResponse.json({
      success: true,
      message: alreadyFinal
        ? 'هذه المحاولة منتهية مسبقًا'
        : expired
          ? 'انتهى الوقت وتم حفظ آخر إجاباتك'
          : 'تم إنهاء المحاولة',
      data: {
        attempt: {
          id: finalized.id,
          status: finalized.status,
          scorePoints: finalized.scorePoints,
          maxPoints: finalized.maxPoints,
          correctCount: finalized.correctCount,
          wrongCount: finalized.wrongCount,
          unansweredCount: finalized.unansweredCount,
          percentage: finalized.percentage,
          requiresManualGrading: finalized.requiresManualGrading,
          submittedAt: finalized.submittedAt,
        },
      },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
