import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { hashPassword } from '@/lib/auth/auth';
import { rateLimit, rateLimitHeaders, clientKey } from '@/lib/security/rate-limit';
import crypto from 'node:crypto';


function hashToken(token: string): string {
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('PASSWORD_RESET_SECRET or JWT_SECRET is required');
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'reset-password'), 10, 15 * 60 * 1000);

  if (!limit.ok) {
    return Response.json(
      { success: false, message: 'عدد كبير من المحاولات. حاول لاحقاً' },
      { status: 429, headers: rateLimitHeaders(limit, 10) },
    );
  }

  let token = '';
  let password = '';

  try {
    const body = await request.json();
    token = typeof body.token === 'string' ? body.token : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return Response.json({ success: false, message: 'طلب غير صالح' }, { status: 400 });
  }

  if (!token) {
    return Response.json({ success: false, message: 'الرمز مطلوب' }, { status: 400 });
  }

  if (password.length < 8) {
    return Response.json(
      { success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
      { status: 400 },
    );
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return Response.json(
      { success: false, message: 'الرمز غير صالح أو منتهي الصلاحية' },
      { status: 400 },
    );
  }

  const hashed = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { password: hashed },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  return NextResponse.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
}
