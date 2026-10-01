import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { ownsCourse } from '@/lib/auth/guards';

const courseSchema = z.object({
  subjectId: z.string().min(1).optional(),
  levelId: z.string().min(1).optional(),
  teacherId: z.string().min(1).optional(),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  type: z.enum(['FREE', 'PAID']).optional(),
  price: z.coerce.number().int().min(0).max(1000000).optional(),
  thumbnail: z.string().trim().max(500).nullable().optional(),
  isPublished: z.boolean().optional(),
});

/**
 * Edit or delete a course.
 *
 * `ownsCourse` already treats ADMIN as an owner, so the same route serves the
 * panel and a teacher editing their own course — no separate admin branch and no
 * second place for the ownership rule to drift.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 401 });
    }

    const { id } = await params;

    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true, teacherId: true },
    });
    if (!course) {
      return NextResponse.json({ success: false, message: 'الدورة غير موجودة' }, { status: 404 });
    }

    const isAdmin = session.role === 'ADMIN';
    if (!isAdmin && !(await ownsCourse(session as never, id))) {
      return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'طلب غير صالح' }, { status: 400 });
    }

    const parsed = courseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Reassigning a course needs the target teacher to exist, otherwise the
    // write succeeds and the course is silently orphaned.
    if (data.teacherId && data.teacherId !== course.teacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: data.teacherId },
        select: { id: true },
      });
      if (!teacher) {
        return NextResponse.json(
          { success: false, message: 'الأستاذ المحدد غير موجود' },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.course.update({
      where: { id },
      data: {
        ...(data.subjectId ? { subjectId: data.subjectId } : {}),
        ...(data.levelId ? { levelId: data.levelId } : {}),
        ...(data.teacherId ? { teacherId: data.teacherId } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.type ? { type: data.type } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.thumbnail !== undefined ? { thumbnail: data.thumbnail } : {}),
        ...(typeof data.isPublished === 'boolean' ? { isPublished: data.isPublished } : {}),
      },
    });

    return NextResponse.json({ success: true, data: { course: updated } });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 401 });
    }

    const { id } = await params;

    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json({ success: false, message: 'الدورة غير موجودة' }, { status: 404 });
    }

    if (session.role !== 'ADMIN' && !(await ownsCourse(session as never, id))) {
      return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 403 });
    }

    /*
     * A course with live sessions cannot be deleted: the session references it
     * and the history is what an admin needs before destroying anything. The
     * course can still be unpublished instead, which is the reversible option.
     */
    const [liveSessions, attempts, enrollments] = await Promise.all([
      prisma.liveSession.count({ where: { courseId: id } }),
      prisma.quizAttempt.count({ where: { quiz: { courseId: id } } }),
      prisma.enrollment.count({ where: { courseId: id } }),
    ]);

    if (liveSessions > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `لا يمكن حذف دورة بها ${liveSessions} بث. يمكنك إلغاء نشرها بدل حذفها.`,
          data: { liveSessions },
        },
        { status: 409 },
      );
    }

    if (enrollments > 0 || attempts > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `لا يمكن حذف دورة لها ${enrollments} تسجيل و ${attempts} محاولة اختبار. يمكنك إلغاء نشرها بدل حذفها.`,
          data: { enrollments, attempts },
        },
        { status: 409 },
      );
    }

    await prisma.course.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}