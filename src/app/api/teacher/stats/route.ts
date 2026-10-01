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

    if (session.role !== 'TEACHER' || !session.teacher?.id) {
      return NextResponse.json(
        { success: false, message: 'هذه الصفحة مخصصة للأستاذ' },
        { status: 403 }
      );
    }

    const teacherId = session.teacher.id;

    const [courses, liveSessions, students, recentAttendance] = await Promise.all([
      prisma.course.count({ where: { teacherId } }),
      prisma.liveSession.count({ where: { course: { teacherId } } }),
      prisma.student.count({ where: { enrollments: { some: { course: { teacherId } } } } }),
      prisma.attendance.findMany({
        where: { session: { course: { teacherId } } },
        orderBy: { joinTime: 'desc' },
        take: 50,
        select: {
          joinTime: true,
          leaveTime: true,
          duration: true,
        },
      }),
    ]);

    const contentCounts = await Promise.all([
      prisma.video.count({ where: { course: { teacherId } } }),
      prisma.file.count({ where: { course: { teacherId } } }),
      prisma.exercise.count({ where: { course: { teacherId } } }),
    ]);

    const [videos, files, exercises] = contentCounts;

    const totalMinutes = recentAttendance.reduce(
      (sum, a) => sum + (a.duration || 0),
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalCourses: courses,
          totalVideos: videos,
          totalFiles: files,
          totalExercises: exercises,
          totalLiveSessions: liveSessions,
          totalStudents: students,
          attendanceRecords: recentAttendance.length,
          totalMinutes,
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
