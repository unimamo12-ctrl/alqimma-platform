import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { ACCESS_LABELS, ACCESS_TYPES, isAccessType } from '@/lib/subscriptions/access';

/**
 * Rejects an empty/blank string *before* `z.coerce.number()` runs.
 *
 * This is the actual bug behind "saving a price does nothing useful": coerce
 * maps `''` to `0`, which passes `.min(0)`, so clearing the price box to retype
 * it saved 0 دج and silently made the whole subject free. `NaN` is rejected by
 * `z.number()` on its own.
 */
const priceField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().min(0, 'السعر غير صالح').max(1000000, 'السعر كبير جدًا'),
);

const daysField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int('المدة يجب أن تكون عددًا صحيحًا').min(1, 'المدة يجب أن تكون يومًا واحدًا على الأقل').max(3650, 'المدة كبيرة جدًا'),
);

const upsertSchema = z.object({
  subjectId: z.string().min(1, 'المادة مطلوبة'),
  accessType: z.string().refine(isAccessType, 'نوع الوصول غير صالح'),
  price: priceField,
  durationDays: daysField,
  isActive: z.boolean().default(true),
});

/**
 * Read and write the (subject, accessType) price catalog.
 *
 * There is no separate "plans" concept anymore: the catalog *is* the price list,
 * and a row here is what makes a cell purchasable. Deactivating a row stops new
 * subscriptions without touching the students who already hold it.
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 },
      );
    }

    const [subjects, access, counts] = await Promise.all([
      prisma.subject.findMany({
        select: {
          id: true,
          name: true,
          nameAr: true,
          icon: true,
          color: true,
          _count: { select: { courses: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.subjectAccess.findMany({
        orderBy: [{ subjectId: 'asc' }, { accessType: 'asc' }],
      }),
      prisma.subscription.groupBy({
        by: ['subjectId', 'accessType'],
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set(`${row.subjectId}:${row.accessType}`, row._count._all);
    }

    return NextResponse.json({
      success: true,
      data: {
        subjects,
        access: access.map((cell) => ({
          id: cell.id,
          subjectId: cell.subjectId,
          accessType: cell.accessType,
          label: ACCESS_LABELS[cell.accessType],
          price: Number(cell.price),
          durationDays: cell.durationDays,
          isActive: cell.isActive,
          subscriptionCount: countMap.get(`${cell.subjectId}:${cell.accessType}`) ?? 0,
        })),
        accessTypes: ACCESS_TYPES,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'طلب غير صالح' },
        { status: 400 },
      );
    }

    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const { subjectId, accessType, price, durationDays, isActive } = parsed.data;

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });

    if (!subject) {
      return NextResponse.json(
        { success: false, message: 'المادة غير موجودة' },
        { status: 404 },
      );
    }

    // Upsert rather than create: the (subject, accessType) pair is unique, and an
    // admin correcting a price should not have to delete the row first.
    const cell = await prisma.subjectAccess.upsert({
      where: { subjectId_accessType: { subjectId, accessType } },
      update: { price, durationDays, isActive },
      create: { subjectId, accessType, price, durationDays, isActive },
    });

    return NextResponse.json({
      success: true,
      data: {
        access: {
          id: cell.id,
          subjectId: cell.subjectId,
          accessType: cell.accessType,
          label: ACCESS_LABELS[cell.accessType],
          price: Number(cell.price),
          durationDays: cell.durationDays,
          isActive: cell.isActive,
        },
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}
