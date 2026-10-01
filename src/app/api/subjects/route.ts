import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { activeAccessBySubject, ACCESS_LABELS, ACCESS_TYPES } from '@/lib/subscriptions/access';

export async function GET() {
  try {
    const session = await getSession();

    const subjects = await prisma.subject.findMany({
      include: {
        _count: { select: { courses: true } },
        access: { where: { isActive: true }, orderBy: { accessType: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    // A logged-in student needs to know which cells they already hold, so the
    // browser can render "subscribed" instead of "subscribe now". Anonymous and
    // staff get the catalog without that overlay.
    const held = session?.role === 'STUDENT' && session.student
      ? await activeAccessBySubject(session.student.id)
      : new Map<string, { accessTypes: string[] }>();

    return NextResponse.json({
      success: true,
      data: {
        subjects: subjects.map((subject) => ({
          id: subject.id,
          name: subject.name,
          nameAr: subject.nameAr,
          icon: subject.icon,
          color: subject.color,
          courseCount: subject._count.courses,
          access: subject.access.map((cell) => ({
            accessType: cell.accessType,
            label: ACCESS_LABELS[cell.accessType],
            price: Number(cell.price),
            durationDays: cell.durationDays,
            isActive: cell.isActive,
            subscribed: held.get(subject.id)?.accessTypes.includes(cell.accessType) ?? false,
          })),
        })),
        accessTypes: ACCESS_TYPES,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
