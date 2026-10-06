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
      activeStudents,
      activeTeachers,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.subject.count(),
      prisma.video.count(),
      prisma.file.count(),
      prisma.liveSession.count(),
      prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
    ]);

    // No revenue line, and no subscription/payment counts. All three went with the
    // payment feature, and leaving the keys in the response would have the admin
    // dashboard render `undefined` tiles.

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
          activeStudents,
          activeTeachers,
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
