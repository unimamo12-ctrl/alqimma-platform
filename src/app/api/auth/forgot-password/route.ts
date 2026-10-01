import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma/client';
import { rateLimit, rateLimitHeaders, clientKey } from '@/lib/security/rate-limit';

const TOKEN_TTL_MINUTES = 30;

function hashToken(token: string): string {
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('PASSWORD_RESET_SECRET or JWT_SECRET is required');
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'forgot-password'), 3, 15 * 60 * 1000);

  if (!limit.ok) {
    return Response.json(
      {
        success: false,
        message: 'عدد كبير من الطلبات. يرجى المحاولة بعد قليل',
      },
      { status: 429, headers: rateLimitHeaders(limit, 3) },
    );
  }

  let email = '';
  try {
    const body = await request.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return Response.json({ success: false, message: 'طلب غير صالح' }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json(
      { success: false, message: 'البريد الإلكتروني غير صالح' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true },
  });

  const genericResponse = Response.json(
    {
      success: true,
      message: 'إذا كان البريد مسجلاً لدينا فسيصلك رابط إعادة التعيين',
    },
    { headers: rateLimitHeaders(limit, 3) },
  );

  if (!user || user.status !== 'ACTIVE') {
    return genericResponse;
  }

  const token = crypto.randomBytes(32).toString('hex');

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  const resetUrl = `${baseUrl()}/reset-password?token=${token}`;

  const webhook = process.env.PASSWORD_RESET_WEBHOOK_URL;

  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, resetUrl, ttlMinutes: TOKEN_TTL_MINUTES }),
      });
    } catch (error) {
      console.error('Failed to dispatch password reset email', error);
      return Response.json(
        { success: false, message: 'تعذر إرسال البريد حالياً. حاول لاحقاً' },
        { status: 502 },
      );
    }
  } else if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev] password reset link for ${user.email}: ${resetUrl}`);
  }

  if (process.env.NODE_ENV !== 'production' && !webhook) {
    return Response.json(
      {
        success: true,
        message: 'تم إنشاء رابط إعادة التعيين (وضع التطوير)',
        data: { resetUrl },
      },
      { headers: rateLimitHeaders(limit, 3) },
    );
  }

  return genericResponse;
}
