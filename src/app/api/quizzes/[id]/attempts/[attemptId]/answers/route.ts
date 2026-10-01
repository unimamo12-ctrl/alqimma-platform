import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireStudent, quizErrorResponse } from '@/lib/quiz/access';
import { isAttemptExpired } from '@/lib/quiz/status';
import { finalizeAttempt, recordAnswer, QuizError } from '@/lib/quiz/service';

type Params = { params: Promise<{ id: string; attemptId: string }> };

const saveSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionId: z.string().nullable().optional(),
  textAnswer: z.string().trim().max(5000).nullable().optional(),
});

/**
 * PUT /api/quizzes/[id]/attempts/[attemptId]/answers
 * Autosave target. Idempotent per question, so a retry after a dropped
 * connection never creates a duplicate or double-counts.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id, attemptId } = await params;
    const guard = await requireStudent();
    if (!guard.ok) return guard.response;
    const studentId = guard.session.student.id;

    const body = await request.json();
    const parsed = saveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, quizId: true, studentId: true, expiresAt: true },
    });

    if (!attempt || attempt.quizId !== id) throw new QuizError('المحاولة غير موجودة', 404);
    if (attempt.studentId !== studentId) throw new QuizError('غير مصرح', 403);

    if (isAttemptExpired(attempt.expiresAt)) {
      // the server clock decides; an expired attempt cannot accept one more save
      await finalizeAttempt(attempt.id, 'TIME_EXPIRED');
      throw new QuizError('انتهى وقت المحاولة', 409);
    }

    const answer = await recordAnswer(attempt.id, studentId, parsed.data);

    return NextResponse.json({
      success: true,
      data: {
        answer: {
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId,
          textAnswer: answer.textAnswer,
          savedAt: answer.updatedAt,
        },
      },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
