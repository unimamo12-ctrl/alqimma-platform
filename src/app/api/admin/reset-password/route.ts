import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/auth';

const schema = z.object({
  password: z.string().min(6, 'كلمة السر قصيرة').max(200),
  // The admin must retype the target's password. Without it, opening this page
  // is enough to lock every account on the platform.
  confirmPassword: z.string().min(1, 'أعد كتابة كلمة السر'),
});

/**
 * Set a new password for any account.
 *
 * Distinct from `/api/auth/change-password`, which proves ownership with the
 * current password. This one is the admin's override and is guarded only by the
 * ADMIN role, so it deliberately demands the new password twice: a single typo
 * in a form that has no "show password" would otherwise lock a real account out
 * with no way back.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'طلب غير صالح' }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const { password, confirmPassword } = parsed.data;
    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: 'كلمتا السر غير متطابقتين' },
        { status: 400 },
      );
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ success: false, message: 'المستخدم مطلوب' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ success: false, message: 'المستخدم غير موجود' }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { password: await hashPassword(password) },
    });

    // Existing refresh tokens are dropped so the old password stops working
    // everywhere immediately, including on a phone that kept the old session.
    const revoked = await prisma.refreshToken.deleteMany({ where: { userId: target.id } });

    return NextResponse.json({
      success: true,
      message: `تم تغيير كلمة السر لـ ${target.email}`,
      data: { email: target.email, role: target.role, revokedSessions: revoked.count },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}