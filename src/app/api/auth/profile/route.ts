import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';

const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'الاسم قصير جداً').max(60),
  lastName: z.string().trim().min(2, 'النسب قصير جداً').max(60),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal('')),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
});

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول أولاً' },
        { status: 401 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'طلب غير صالح' },
        { status: 400 }
      );
    }

    const parsed = profileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      );
    }

    const { firstName, lastName, phone, bio } = parsed.data;

    if (session.role === 'TEACHER' && session.teacher) {
      await prisma.teacher.update({
        where: { id: session.teacher.id },
        data: {
          firstName,
          lastName,
          ...(bio !== undefined ? { bio: bio || null } : {}),
        },
      });
    } else if (session.role === 'STUDENT' && session.student) {
      await prisma.student.update({
        where: { id: session.student.id },
        data: { firstName, lastName, ...(phone ? { phone } : {}) },
      });
    } else {
      return NextResponse.json(
        { success: false, message: 'لا يوجد ملف شخصي مرتبط بهذا الحساب' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: 'تم حفظ التغييرات' });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
