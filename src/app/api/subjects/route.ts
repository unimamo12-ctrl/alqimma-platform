import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  try {
    /*
     * The catalog, and nothing else.
     *
     * This used to be a public route that nobody could subscribe through: it sent
     * a `subscribed` flag per (subject, accessType) cell and the active price, so
     * the browser could render "اشترك الآن" against the right cell. Both are gone
     * with the payment feature, and so is the `access` array it read from.
     *
     * `getSession` went with them. The endpoint is public either way — it never
     * returned anything role-specific — and keeping the call would have implied a
     * per-viewer response that no longer exists.
     */
    const subjects = await prisma.subject.findMany({
      include: { _count: { select: { courses: true } } },
      orderBy: { name: 'asc' },
    });

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
        })),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}