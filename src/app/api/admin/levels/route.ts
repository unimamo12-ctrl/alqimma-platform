import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, serverError } from '@/lib/auth/guards';

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'الاسم مطلوب')
    .max(60)
    .regex(/^[A-Za-z0-9_-]+$/, 'الاسم يجب أن يكون بالإنجليزية دون مسافات'),
  nameAr: z.string().trim().max(60).optional().or(z.literal('')),
  icon: z.string().trim().max(8).optional().or(z.literal('')),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'اللون يجب أن يكون بصيغة #RRGGBB')
    .optional()
    .or(z.literal('')),
  order: z.coerce.number().int().min(0).max(999).optional(),
});

/**
 * Create a level.
 *
 * Levels and subjects had only a GET route: nothing in the app could create them,
 * so a fresh deployment had no catalog at all and "add course" was permanently
 * unsendable — the only way out was running `npm run seed` over a shell. Admin-only,
 * because a course cannot exist without both.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;

    if (guard.session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'إضافة المستويات من صلاحيات الإدارة فقط' },
        { status: 403 },
      );
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const { name, nameAr, order } = parsed.data;
    const upper = name.toUpperCase();

    const existing = await prisma.level.findUnique({ where: { name: upper } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: 'هذا المستوى موجود بالفعل' },
        { status: 409 },
      );
    }

    // Order defaults to the end so a new level lands last without the admin
    // having to count.
    const count = await prisma.level.count();

    const level = await prisma.level.create({
      data: {
        name: upper,
        nameAr: nameAr || null,
        order: order ?? count + 1,
      },
    });

    return NextResponse.json({ success: true, data: { level } }, { status: 201 });
  } catch {
    return serverError();
  }
}