import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { removeLocalUpload } from '@/lib/storage/uploads';
import {
  requireTeacherOrAdmin,
  ownsCourse,
  notFound,
  serverError,
} from '@/lib/auth/guards';
import { requireCourseAccess } from '@/lib/subscriptions/access';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            isPublished: true,
teacherId: true,
      subjectId: true,
      // FREE courses skip the subscription gate, so the guard below needs it.
      type: true,
      subject: { select: { name: true } },
      level: { select: { name: true } },
          },
        },
      },
    });

    if (!video) return notFound('الفيديو غير موجود');

    const session = await getSession();
    const isOwner =
      session?.role === 'ADMIN' ||
      (session?.role === 'TEACHER' && session.teacher?.id === video.course.teacherId);

    if (!isOwner && (!video.isPublished || !video.course.isPublished)) {
      return notFound('الفيديو غير موجود');
    }

    // A FREE course is open to any student; a PAID one needs an active VIDEO
    // subscription for its subject. The list endpoint hides what they cannot
    // open, but the URL is guessable, so the check has to be here too.
    if (session?.role === 'STUDENT') {
      const access = await requireCourseAccess(
        session.student?.id ?? null,
        video.course.subjectId,
        'VIDEO',
        video.course.type,
      );
      if (!access.ok) return access.response;
    }

    return NextResponse.json({ success: true, data: { video } });
  } catch {
    return serverError();
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id },
      select: { id: true, courseId: true },
    });

    if (!video) return notFound('الفيديو غير موجود');

    if (!(await ownsCourse(session, video.courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بتعديل هذا الفيديو' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : undefined;
    const description =
      typeof body.description === 'string' ? body.description.trim() : undefined;
    const url = typeof body.url === 'string' ? body.url.trim() : undefined;
    const thumbnail =
      typeof body.thumbnail === 'string' ? body.thumbnail.trim() : undefined;

    if (title !== undefined && !title) {
      return NextResponse.json(
        { success: false, message: 'العنوان مطلوب' },
        { status: 400 },
      );
    }

    const updated = await prisma.video.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(url !== undefined ? { url } : {}),
        ...(thumbnail !== undefined ? { thumbnail } : {}),
        ...(typeof body.duration === 'number' ? { duration: body.duration } : {}),
        ...(typeof body.order === 'number' ? { order: body.order } : {}),
        ...(typeof body.isPublished === 'boolean'
          ? { isPublished: body.isPublished }
          : {}),
      },
    });

    return NextResponse.json({ success: true, data: { video: updated } });
  } catch {
    return serverError();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id },
      select: { id: true, courseId: true, url: true },
    });

    if (!video) return notFound('الفيديو غير موجود');

    if (!(await ownsCourse(session, video.courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بحذف هذا الفيديو' },
        { status: 403 },
      );
    }

    await prisma.video.delete({ where: { id } });
    await removeLocalUpload(video.url);

    return NextResponse.json({ success: true });
  } catch {
    return serverError();
  }
}
