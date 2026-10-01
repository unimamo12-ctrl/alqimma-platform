import { NextRequest, NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth/auth';
import { loginSchema } from '@/lib/validation/auth';
import {
  checkLimit,
  clearLimit,
  rateLimitHeaders,
  clientKey,
} from '@/lib/security/rate-limit';

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ipKey = clientKey(request, 'login');
  const ipLimit = checkLimit(ipKey, MAX_ATTEMPTS, WINDOW_MS, false);

  if (!ipLimit.ok) {
    return NextResponse.json(
      { success: false, message: 'عدد كبير من محاولات الدخول الفاشلة. حاول بعد 15 دقيقة' },
      { status: 429, headers: rateLimitHeaders(ipLimit, MAX_ATTEMPTS) },
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

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const accountKey = `login:email:${email}`;
  const accountLimit = checkLimit(accountKey, MAX_ATTEMPTS, WINDOW_MS, false);

  if (!accountLimit.ok) {
    return NextResponse.json(
      { success: false, message: 'محاولات فاشلة كثيرة لهذا الحساب. حاول بعد 15 دقيقة' },
      { status: 429, headers: rateLimitHeaders(accountLimit, MAX_ATTEMPTS) },
    );
  }

  try {
    const result = await loginUser(email, parsed.data.password);

    clearLimit(ipKey);
    clearLimit(accountKey);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
    const invalidCredentials = message.includes('غير صحيحة');

    if (invalidCredentials) {
      checkLimit(ipKey, MAX_ATTEMPTS, WINDOW_MS, true);
      checkLimit(accountKey, MAX_ATTEMPTS, WINDOW_MS, true);
    }

    return NextResponse.json(
      { success: false, message },
      { status: invalidCredentials ? 401 : 500 },
    );
  }
}
