import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, serverError } from '@/lib/auth/guards';

/**
 * Delete a subject.
 *
 * Refuses while anything references it: courses are a teacher's work, and a
 * subscription is a student's money. Cascading either would destroy real data.
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
        { success: false, message: 'حذف المواد من صلاحيات الإدارة فقط' },
        { status: 403 },
      );
    }

    const { id } = await params;

    const subject = await prisma.subject.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { courses: true, subscriptions: true } },
      },
    });
    if (!subject) {
      return NextResponse.json(
        { success: false, message: 'المادة غير موجودة' },
        { status: 404 },
      );
    }

    if (subject._count.courses > 0 || subject._count.subscriptions > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            subject._count.subscriptions > 0
              ? `لا يمكن حذف مادة فيها ${subject._count.subscriptions} اشتراكًا`
              : `لا يمكن حذف مادة ترتبط بها ${subject._count.courses} دورة`,
        },
        { status: 409 },
      );
    }

    // The price cells have no independent meaning without their subject.
    await prisma.subjectAccess.deleteMany({ where: { subjectId: id } });
    await prisma.subject.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return serverError();
  }
}