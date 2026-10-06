import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول أولاً' },
        { status: 401 }
      );
    }

    if (session.role !== 'STUDENT' || !session.student?.id) {
      return NextResponse.json(
        { success: false, message: 'هذه الصفحة مخصصة للطالب' },
        { status: 403 }
      );
    }

    const studentId = session.student.id;

    const [enrolledCourses, liveNow, upcoming, attendances] = await Promise.all([
      prisma.enrollment.count({ where: { studentId } }),
      prisma.liveSession.count({ where: { status: 'LIVE' } }),
      prisma.liveSession.count({ where: { status: 'SCHEDULED' } }),
      prisma.attendance.findMany({
        where: { studentId, session: { status: { in: ['ENDED', 'LIVE'] } } },
        select: { duration: true, leaveTime: true },
      }),
    ]);

    const totalSessions = await prisma.liveSession.count({
      where: { status: { in: ['ENDED', 'LIVE'] } },
    });

    const attendanceRate = totalSessions === 0
      ? null
      : Math.round((attendances.length / totalSessions) * 100);

    return NextResponse.json({
      success: true,
      data: {
        enrolledCourses,
        liveNow,
        upcoming,
        attendanceRate,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
