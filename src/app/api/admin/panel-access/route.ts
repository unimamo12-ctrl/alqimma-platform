import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';
import { generateAccessToken, generateRefreshToken } from '@/lib/auth/token';
import { setAuthCookies } from '@/lib/auth/jwt';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Failed attempts per client address.
 *
 * In-memory, so it resets when the process restarts and does not coordinate
 * across instances. That is acceptable here precisely because guessing an
 * unknown password is expensive (bcrypt) and the same weakness already exists
 * on the normal login route; a real deployment wants this in the database or a
 * shared cache.
 */
const attempts = new Map<string, { count: number; firstAt: number }>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'local';
}

function isLockedOut(key: string): boolean {
  const record = attempts.get(key);
  if (!record) return false;

  if (Date.now() - record.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function noteFailure(key: string) {
  const record = attempts.get(key);
  if (!record || Date.now() - record.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  record.count += 1;
}

export async function POST(request: Request) {
  const key = clientKey(request);

  if (isLockedOut(key)) {
    return NextResponse.json(
      { success: false, message: 'محاولات كثيرة. حاول بعد بضع دقائق.' },
      { status: 429 },
    );
  }

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === 'string') password = body.password;
  } catch {
    return NextResponse.json(
      { success: false, message: 'طلب غير صالح' },
      { status: 400 },
    );
  }

  if (!password) {
    return NextResponse.json(
      { success: false, message: 'كلمة السر مطلوبة' },
      { status: 400 },
    );
  }

  /*
   * Compared against ADMIN accounts only.
   *
   * This is the line that matters. Verifying the password against "any user"
   * would let a teacher or a student type their own password and be handed an
   * ADMIN session — the password-only field turns that mistake from impossible
   * into a privilege escalation, so the role check is not optional here.
   */
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true, email: true, password: true },
  });

  let matched = null;
  for (const admin of admins) {
    const ok = await compare(password, admin.password);
    if (ok) {
      matched = admin;
      break;
    }
  }

  if (!matched) {
    noteFailure(key);
    return NextResponse.json(
      { success: false, message: 'كلمة السر غير صحيحة' },
      { status: 401 },
    );
  }

  attempts.delete(key);

  const role = 'ADMIN';
  const accessToken = generateAccessToken({ userId: matched.id, email: matched.email, role });
  const refreshToken = generateRefreshToken({ userId: matched.id, email: matched.email, role });

  await setAuthCookies(accessToken, refreshToken);

  return NextResponse.json({
    success: true,
    data: { email: matched.email, role },
  });
}