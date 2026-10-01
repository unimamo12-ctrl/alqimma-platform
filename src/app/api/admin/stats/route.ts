import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    const [
      totalStudents,
      totalTeachers,
      totalSubjects,
      totalVideos,
      totalFiles,
      totalLiveSessions,
      totalSubscriptions,
      totalPayments,
      activeStudents,
      activeTeachers,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.subject.count(),
      prisma.video.count(),
      prisma.file.count(),
      prisma.liveSession.count(),
      prisma.subscription.count(),
      prisma.payment.count(),
      prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
    ]);

    const totalRevenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'COMPLETED' },
    });

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalStudents,
          totalTeachers,
          totalSubjects,
          totalVideos,
          totalFiles,
          totalLiveSessions,
          totalSubscriptions,
          totalPayments,
          activeStudents,
          activeTeachers,
          totalRevenue: totalRevenue._sum.amount || 0,
        },
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
