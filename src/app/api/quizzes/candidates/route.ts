import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, ownsCourse, notFound } from '@/lib/auth/guards';

/**
 * GET /api/quizzes/candidates?courseId=...
 * Students enrolled in one specific course, used by the assignment picker so
 * the teacher can never pick someone the server would reject later.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');

    if (!courseId) {
      return NextResponse.json(
        { success: false, message: 'الدورة مطلوبة' },
        { status: 400 },
      );
    }

    if (!(await ownsCourse(session, courseId))) {
      return notFound('الدورة غير موجودة');
    }

    const students = await prisma.enrollment.findMany({
      where: { courseId },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            level: true,
            class: true,
            user: { select: { email: true, status: true } },
          },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
      take: 500,
    });

    return NextResponse.json({
      success: true,
      data: {
        students: students
          .map((row) => row.student)
          .filter((student) => student.user.status === 'ACTIVE'),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}
