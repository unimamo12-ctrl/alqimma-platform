import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { requireTeacherOrAdmin, ownsCourse } from '@/lib/auth/guards';
import { courseAccessFilter } from '@/lib/subscriptions/access';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');
    const courseId = searchParams.get('courseId');

    const where: Prisma.VideoWhereInput = { isPublished: true };
    if (courseId) where.courseId = courseId;

    const session = await getSession();
    const isAdmin = session?.role === 'ADMIN';
    const ownTeacherId = session?.role === 'TEACHER' ? session.teacher?.id : undefined;

    if (isAdmin || ownTeacherId) {
      delete where.isPublished;
    }

    const courseFilter: Prisma.CourseWhereInput = {};
    if (ownTeacherId) courseFilter.teacherId = ownTeacherId;
    if (!isAdmin && !ownTeacherId) courseFilter.isPublished = true;

    // A student sees FREE courses plus the PAID subjects they hold an active
    // VIDEO subscription for. Without this the list leaks every published video
    // on the platform to any logged-in student; without the FREE arm a free
    // course would be hidden from the very students it is free for.
    if (session?.role === 'STUDENT') {
      Object.assign(
        courseFilter,
        await courseAccessFilter(session.student?.id ?? null, 'VIDEO'),
      );
    }

    if (teacherId && (isAdmin || teacherId === ownTeacherId)) {
      courseFilter.teacherId = teacherId;
    }

    if (Object.keys(courseFilter).length > 0) {
      where.course = courseFilter;
    }

    const videos = await prisma.video.findMany({
      where,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            subject: { select: { name: true } },
            level: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: { videos },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const body = await request.json();
    const { courseId, title, description, url, thumbnail, duration, order, isPublished, liveSessionId } = body;

    if (!courseId || !title || !url) {
      return NextResponse.json(
        { success: false, message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' },
        { status: 400 }
      );
    }

    if (!(await ownsCourse(session, courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بإضافة فيديو لهذه الدورة' },
        { status: 403 }
      );
    }

    // live recordings land as a draft so the teacher publishes it explicitly
    const published = liveSessionId ? isPublished === true : isPublished !== false;

    if (liveSessionId) {
      const liveSession = await prisma.liveSession.findUnique({ where: { id: liveSessionId } });
      if (!liveSession || liveSession.courseId !== courseId) {
        return NextResponse.json(
          { success: false, message: 'جلسة البث غير موجودة أو لا تخص هذه الدورة' },
          { status: 404 }
        );
      }
      if (liveSession.teacherId !== session.teacher?.id && session.role !== 'ADMIN') {
        return NextResponse.json(
          { success: false, message: 'غير مصرح بربط التسجيل بهذه الجلسة' },
          { status: 403 }
        );
      }
    }

    const video = await prisma.video.create({
      data: {
        courseId,
        title,
        description,
        url,
        thumbnail,
        duration: duration || 0,
        order: order || 0,
        isPublished: published,
      },
      include: {
        course: { select: { id: true, title: true } },
      },
    });

    if (liveSessionId) {
      await prisma.liveSession.update({
        where: { id: liveSessionId },
        data: { isRecorded: true, recordingUrl: url },
      });
    }

    return NextResponse.json({
      success: true,
      data: { video },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
