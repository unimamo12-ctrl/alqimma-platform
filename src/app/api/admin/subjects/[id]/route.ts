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
        _count: { select: { courses: true } },
      },
    });
    if (!subject) {
      return NextResponse.json(
        { success: false, message: 'المادة غير موجودة' },
        { status: 404 },
      );
    }

    // Courses are a teacher's work, so the guard stays. The subscription count
    // that used to sit beside it went with the payment feature.
    if (subject._count.courses > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `لا يمكن حذف مادة ترتبط بها ${subject._count.courses} دورة`,
        },
        { status: 409 },
      );
    }

    await prisma.subject.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return serverError();
  }
}