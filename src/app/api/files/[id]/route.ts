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

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            isPublished: true,
            teacherId: true,
            subject: { select: { name: true } },
            level: { select: { name: true } },
          },
        },
      },
    });

    if (!file) return notFound('الملف غير موجود');

    const session = await getSession();
    const isOwner =
      session?.role === 'ADMIN' ||
      (session?.role === 'TEACHER' && session.teacher?.id === file.course.teacherId);

    if (!isOwner && (!file.isPublished || !file.course.isPublished)) {
      return notFound('الملف غير موجود');
    }

    return NextResponse.json({ success: true, data: { file } });
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

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, courseId: true, url: true },
    });

    if (!file) return notFound('الملف غير موجود');

    if (!(await ownsCourse(session, file.courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بحذف هذا الملف' },
        { status: 403 },
      );
    }

    await prisma.file.delete({ where: { id } });
    await removeLocalUpload(file.url);

    return NextResponse.json({ success: true });
  } catch {
    return serverError();
  }
}
