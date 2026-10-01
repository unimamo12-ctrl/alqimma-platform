import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, notFound } from '@/lib/auth/guards';
import { ownsQuiz, quizErrorResponse } from '@/lib/quiz/access';
import { syncQuizAssignments } from '@/lib/quiz/writer';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/quizzes/[id]/assign
 * Replaces the target list. Students who already have an attempt keep their
 * assignment row, so no report or result page can lose its owner.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!(await ownsQuiz(session, id))) return notFound('الاختبار غير موجود');

    const body = await request.json();
    const courseWide = body.courseWide === true;
    const studentIds: string[] = Array.isArray(body.studentIds) ? body.studentIds : [];

    const quiz = await prisma.quiz.findUnique({ where: { id }, select: { courseId: true } });
    if (!quiz) return notFound('الاختبار غير موجود');

    const count = await syncQuizAssignments(id, quiz.courseId, studentIds, courseWide);

    return NextResponse.json({
      success: true,
      message: `تم تحديث إسناد الاختبار (${count} تلميذ)`,
      data: { count },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
