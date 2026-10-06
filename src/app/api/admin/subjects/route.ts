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
});

/**
 * Create a subject.
 *
 * Subjects had only a GET route, so a deployment without `npm run seed` had no
 * catalog and no way to add one from the app: "add course" rendered two empty
 * dropdowns and could not be submitted at all. Admin-only.
 *
 * The name is the join key the rest of the platform uses (`Course.subject.name`,
 * `Teacher.subjects`, the seed's `SUBJECTS`), so it is kept latin and unique, and
 * `nameAr` is what the UI shows.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;

    if (guard.session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'إضافة المواد من صلاحيات الإدارة فقط' },
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

    const { name, nameAr, icon, color } = parsed.data;
    const upper = name.toUpperCase();

    const existing = await prisma.subject.findUnique({ where: { name: upper } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: 'هذه المادة موجودة بالفعل' },
        { status: 409 },
      );
    }

    const subject = await prisma.subject.create({
      data: {
        name: upper,
        nameAr: nameAr || null,
        icon: icon || null,
        color: color || null,
      },
    });

    // Creating the subject is the whole job now. It used to also create three
    // price cells here, because a subject with no prices had nothing a student
    // could buy and so looked configured while being unusable. With no payment
    // there is nothing to sell, and the extra rows would only be dead config.

    return NextResponse.json({ success: true, data: { subject } }, { status: 201 });
  } catch {
    return serverError();
  }
}