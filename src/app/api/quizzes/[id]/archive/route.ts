import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, notFound } from '@/lib/auth/guards';
import { ownsQuiz, quizErrorResponse } from '@/lib/quiz/access';
import { finalizeAttempt, QuizError } from '@/lib/quiz/service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/quizzes/[id]/archive
 * Hides the quiz from the active list without touching any attempt, answer or
 * result. Archiving also force-closes attempts that are still running.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!(await ownsQuiz(session, id))) return notFound('الاختبار غير موجود');

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!quiz) return notFound('الاختبار غير موجود');

    if (quiz.status === 'ARCHIVED') {
      throw new QuizError('الاختبار مؤرشف بالفعل', 409);
    }

    if (quiz.status === 'DRAFT') {
      throw new QuizError('المسودة لا تحتاج أرشفة، احذفها بدلًا من ذلك', 400);
    }

    // grade whatever was still running so no attempt is left half-finished
    const open = await prisma.quizAttempt.findMany({
      where: { quizId: id, status: 'IN_PROGRESS' },
      select: { id: true },
    });

    for (const attempt of open) {
      await finalizeAttempt(attempt.id, 'ARCHIVED');
    }

    await prisma.quiz.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message:
        open.length > 0
          ? `تم أرشفة الاختبار وإنهاء ${open.length} محاولة جارية`
          : 'تم أرشفة الاختبار',
      data: { closedAttempts: open.length },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}

/** DELETE here means "restore from archive" — data is never destroyed. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!(await ownsQuiz(session, id))) return notFound('الاختبار غير موجود');

    const quiz = await prisma.quiz.findUnique({ where: { id }, select: { status: true } });
    if (!quiz) return notFound('الاختبار غير موجود');

    if (quiz.status !== 'ARCHIVED') {
      throw new QuizError('هذا الاختبار ليس مؤرشفًا', 409);
    }

    await prisma.quiz.update({
      where: { id },
      data: { status: 'PUBLISHED', archivedAt: null },
    });

    return NextResponse.json({ success: true, message: 'تمت استعادة الاختبار من الأرشيف' });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
