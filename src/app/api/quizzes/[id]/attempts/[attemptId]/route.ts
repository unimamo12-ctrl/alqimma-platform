import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireStudent, quizErrorResponse } from '@/lib/quiz/access';
import { isAttemptExpired } from '@/lib/quiz/status';
import { finalizeAttempt, QuizError } from '@/lib/quiz/service';
import { toStudentQuestion } from '@/lib/quiz/serialize';

type Params = { params: Promise<{ id: string; attemptId: string }> };

/**
 * GET /api/quizzes/[id]/attempts/[attemptId]
 * Re-hydrates the attempt after a refresh or reconnect. Also the sweep point
 * that force-closes an attempt whose server-side deadline already passed.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id, attemptId } = await params;
    const guard = await requireStudent();
    if (!guard.ok) return guard.response;
    const studentId = guard.session.student.id;

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: true,
        quiz: {
          include: {
            questions: { orderBy: { order: 'asc' }, include: { options: true } },
          },
        },
      },
    });

    if (!attempt || attempt.quizId !== id) throw new QuizError('المحاولة غير موجودة', 404);
    if (attempt.studentId !== studentId) throw new QuizError('غير مصرح', 403);

    if (attempt.status === 'IN_PROGRESS' && isAttemptExpired(attempt.expiresAt)) {
      await finalizeAttempt(attempt.id, 'TIME_EXPIRED');
      throw new QuizError('انتهى وقت المحاولة', 409);
    }

    return NextResponse.json({
      success: true,
      data: {
        attempt: {
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          title: attempt.quiz.title,
          durationMin: attempt.quiz.durationMin,
          totalPoints: attempt.quiz.totalPoints,
          allowNavigation: attempt.quiz.allowNavigation,
        },
        questions: attempt.quiz.questions.map(toStudentQuestion),
        savedAnswers: Object.fromEntries(
          attempt.answers.map((answer) => [
            answer.questionId,
            {
              selectedOptionId: answer.selectedOptionId,
              textAnswer: answer.textAnswer,
            },
          ]),
        ),
      },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
