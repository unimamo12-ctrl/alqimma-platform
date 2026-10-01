import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, notFound } from '@/lib/auth/guards';
import { ownsQuiz, quizErrorResponse } from '@/lib/quiz/access';
import { assertQuestionsPresent } from '@/lib/quiz/writer';
import { QuizError } from '@/lib/quiz/service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/quizzes/[id]/publish
 * Flips DRAFT -> PUBLISHED and notifies every assigned student. Everything
 * time-based after this is derived, so there is no "make available" button.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!(await ownsQuiz(session, id))) return notFound('الاختبار غير موجود');

    const quiz = await assertQuestionsPresent(id);

    if (quiz.status === 'ARCHIVED') {
      throw new QuizError('أرشف الاختبار أولاً قبل إعادة نشره', 409);
    }

    if (quiz.status !== 'DRAFT') {
      // republishing an already published quiz is harmless
      return NextResponse.json({
        success: true,
        message: 'الاختبار منشور بالفعل',
        data: { quiz },
      });
    }

    const assignments = await prisma.quizAssignment.findMany({
      where: { quizId: id },
      select: { student: { select: { userId: true } } },
    });

    if (assignments.length === 0) {
      throw new QuizError('حدّد تلميذين على الأقل قبل النشر', 400);
    }

    const published = await prisma.quiz.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    await prisma.notification.createMany({
      data: assignments.map((assignment) => ({
        userId: assignment.student.userId,
        title: 'اختبار جديد',
        message: `تم نشر اختبار "${quiz.title}"`,
        type: 'QUIZ',
        link: `/student/quizzes/${id}`,
      })),
    });

    return NextResponse.json({
      success: true,
      message: `تم نشر الاختبار إلى ${assignments.length} تلميذ`,
      data: { quiz: published },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
