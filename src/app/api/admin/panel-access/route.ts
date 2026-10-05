import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';
import { generateAccessToken, generateRefreshToken } from '@/lib/auth/token';
import { setAuthCookies } from '@/lib/auth/jwt';
import { checkLimit, clearLimit, clientKey } from '@/lib/security/rate-limit';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Failed attempts per client address.
 *
 * This used to be a second hand-rolled Map inside this file. It is now the shared
 * limiter, which matters for two reasons: the local copy keyed on the *leftmost*
 * `x-forwarded-for` entry, so a forged header gave a fresh bucket per request and
 * this gate — password only, with no second factor to slow a guesser — recorded
 * 12 consecutive attempts without ever locking; and a private Map has no bound on
 * its size, so a spray across many addresses grew it without limit.
 *
 * The limiter is still per-process, so it resets on restart and does not
 * coordinate across instances. See `clientIp` for what the key is and is not.
 */
function isLockedOut(key: string): boolean {
  // `record: false` — a probe must not itself count as an attempt
  return !checkLimit(key, MAX_ATTEMPTS, WINDOW_MS, false).ok;
}

function noteFailure(key: string) {
  checkLimit(key, MAX_ATTEMPTS, WINDOW_MS, true);
}

export async function POST(request: Request) {
  const key = clientKey(request, 'panel-access');

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

  clearLimit(key);

  const role = 'ADMIN';
  const accessToken = generateAccessToken({ userId: matched.id, email: matched.email, role });
  const refreshToken = generateRefreshToken({ userId: matched.id, email: matched.email, role });

  await setAuthCookies(accessToken, refreshToken);

  return NextResponse.json({
    success: true,
    data: { email: matched.email, role },
  });
}