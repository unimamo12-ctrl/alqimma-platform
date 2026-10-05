import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, serverError } from '@/lib/auth/guards';

/**
 * Delete a level.
 *
 * Refuses while any course uses it rather than cascading: a course is a teacher's
 * work, and silently deleting the level would leave it unopenable and disappear
 * from every list. Deactivate or re-assign instead.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;

    if (guard.session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'حذف المستويات من صلاحيات الإدارة فقط' },
        { status: 403 },
      );
    }

    const { id } = await params;

    const level = await prisma.level.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { courses: true } } },
    });
    if (!level) {
      return NextResponse.json(
        { success: false, message: 'المستوى غير موجود' },
        { status: 404 },
      );
    }

    if (level._count.courses > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `لا يمكن حذف مستوى ترتبط به ${level._count.courses} دورة`,
        },
        { status: 409 },
      );
    }

    await prisma.level.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return serverError();
  }
}