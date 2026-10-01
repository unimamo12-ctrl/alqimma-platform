import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/jwt';
import { prisma } from '@/lib/prisma/client';

/**
 * Who can actually watch a broadcast for a given course.
 *
 * A teacher broadcasting into an empty room has no way to tell "nobody came"
 * apart from "nobody is allowed to come": `/api/live` filters by an ACTIVE,
 * unexpired LIVE subscription for the course's subject, so a session in a
 * subject with no LIVE subscribers is invisible to every student and the only
 * symptom is an empty roster. This endpoint makes that visible *before* the
 * broadcast starts.
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
        subjectId: true,
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

    const now = new Date();

    const [eligible, enrolled, livePriceCell, totalStudents] = await Promise.all([
      prisma.student.findMany({
        where: {
          user: { status: 'ACTIVE' },
          subscriptions: {
            some: {
              subjectId: course.subjectId,
              accessType: 'LIVE',
              status: 'ACTIVE',
              startDate: { lte: now },
              endDate: { gte: now },
            },
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          user: { select: { email: true } },
        },
        orderBy: { firstName: 'asc' },
      }),
      prisma.enrollment.count({ where: { courseId } }),
      prisma.subjectAccess.findUnique({
        where: {
          subjectId_accessType: { subjectId: course.subjectId, accessType: 'LIVE' },
        },
        select: { isActive: true, price: true },
      }),
      prisma.student.count({ where: { user: { status: 'ACTIVE' } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        courseId: course.id,
        courseTitle: course.title,
        subject: course.subject,
        // the same predicate /api/live enforces, so this number matches reality
        eligibleCount: eligible.length,
        eligible: eligible.map((student) => ({
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          email: student.user.email,
        })),
        enrolledCount: enrolled,
        totalStudents,
        // A deactivated price cell stops new subscriptions but does not
        // invalidate the ones students already hold, so it is reported
        // separately rather than folded into `eligible`.
        livePriceActive: livePriceCell?.isActive ?? false,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}