import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/jwt';
import { prisma } from '@/lib/prisma/client';

/**
 * Who can watch a broadcast for a given course.
 *
 * This endpoint existed because eligibility was a *payment* question: a teacher
 * broadcasting into an empty room could not tell "nobody came" from "nobody is
 * allowed to come", because the student list was filtered down to ACTIVE LIVE
 * subscriptions and everyone else was invisible. With no subscriptions, every
 * active student can join, so the eligibility question is answered rather than
 * reported.
 *
 * What survives is the part that was never about money: how many students are
 * on the platform, and how many are enrolled in this course. A teacher still
 * needs to see that before broadcasting.
 *
 * The `livePriceActive` flag is gone — it reported whether new subscriptions for
 * the subject's LIVE cell could be sold, which is meaningless now. The UI that
 * rendered it had to stop reading it in the same change, or it would have
 * defaulted a missing field to `false` and warned about a price that no longer
 * exists.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 },
      );
    }

    const courseId = request.nextUrl.searchParams.get('courseId');
    if (!courseId) {
      return NextResponse.json(
        { success: false, message: 'الدورة مطلوبة' },
        { status: 400 },
      );
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        teacherId: true,
        subject: { select: { id: true, name: true, nameAr: true } },
      },
    });

    if (!course) {
      return NextResponse.json(
        { success: false, message: 'الدورة غير موجودة' },
        { status: 404 },
      );
    }

    // A teacher only gets the audience for their own course, exactly like the
    // session list is scoped to them.
    if (session.role === 'TEACHER' && course.teacherId !== session.teacher?.id) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 403 },
      );
    }

    const [eligible, enrolled, totalStudents] = await Promise.all([
      // everyone active, because everyone may now join
      prisma.student.findMany({
        where: { user: { status: 'ACTIVE' } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          user: { select: { email: true } },
        },
        orderBy: { firstName: 'asc' },
      }),
      prisma.enrollment.count({ where: { courseId } }),
      prisma.student.count({ where: { user: { status: 'ACTIVE' } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        courseId: course.id,
        courseTitle: course.title,
        subject: course.subject,
        eligibleCount: eligible.length,
        eligible: eligible.map((student) => ({
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          email: student.user.email,
        })),
        enrolledCount: enrolled,
        totalStudents,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}