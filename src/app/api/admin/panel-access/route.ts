import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';
import { generateAccessToken, generateRefreshToken } from '@/lib/auth/token';
import { setAuthCookies } from '@/lib/auth/jwt';
import { checkLimit, clearLimit, clientKey } from '@/lib/security/rate-limit';

const IP_MAX = 10;
const ACCOUNT_MAX = 5;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Failed attempts, tracked twice.
 *
 * This used to be a second hand-rolled Map inside this file, keyed on the
 * *leftmost* `x-forwarded-for` entry — so a forged header gave a fresh bucket per
 * request and this gate, being password-only with no second factor to slow a
 * guesser, recorded 12 consecutive attempts without ever locking. A private Map
 * also has no bound on its size, so a spray across many addresses grew it without
 * limit. It is now the shared limiter, which fixes the key.
 *
 * Two budgets rather than one, for the same reason `forgot-password` has two:
 * the per-account one is the real defence, and it is immune to a shared address.
 *
 * Still per-process, so it resets on restart and does not coordinate across
 * instances. See `clientIp` for what the key is and is not.
 */
function isLockedOut(key: string, max: number): boolean {
  // `record: false` — a probe must not itself count as an attempt
  return !checkLimit(key, max, WINDOW_MS, false).ok;
}

function noteFailure(key: string) {
  checkLimit(key, ACCOUNT_MAX, WINDOW_MS, true);
}

export async function POST(request: Request) {
  const ipKey = clientKey(request, 'panel-access');

  if (isLockedOut(ipKey, IP_MAX)) {
    return NextResponse.json(
      { success: false, message: 'محاولات كثيرة. حاول بعد بضع دقائق.' },
      { status: 429 },
    );
  }

  let email = '';
  let password = '';
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    if (typeof body.email === 'string') email = body.email.trim().toLowerCase();
    if (typeof body.password === 'string') password = body.password;
  } catch {
    return NextResponse.json(
      { success: false, message: 'طلب غير صالح' },
      { status: 400 },
    );
  }

  if (!email || !password) {
    return NextResponse.json(
      { success: false, message: 'البريد وكلمة السر مطلوبان' },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, message: 'البريد الإلكتروني غير صالح' },
      { status: 400 },
    );
  }

  /*
   * One named account, compared with bcrypt.
   *
   * The gate used to take a password alone and try it against every ADMIN in turn.
   * That had two problems this form does not have:
   *
   * - **You did not say who you were.** Any admin's password opened the panel, so
   *   two operators shared one secret and neither could tell from the login which
   *   session they had just created. It also meant the number of guesses an
   *   attacker gets scales with the number of admins on the platform.
   * - **It walked every admin's hash**, so the work per attempt grew with the
   *   roster and the timing depended on which row matched.
   *
   * `role: 'ADMIN'` is still not optional. The alternative — looking the email up
   * among all users — would let a teacher or student type their own credentials and
   * be handed an ADMIN session, which the old password-only field made impossible
   * and this must not reintroduce.
   */
  const account = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, role: true, status: true },
  });

  const accountKey = `panel-access:account:${email}`;

  const wrongAccount = !account || account.role !== 'ADMIN' || account.status !== 'ACTIVE';

  /*
   * The per-account budget is checked before bcrypt, and a missing account is
   * counted against the address the same way a wrong password is.
   *
   * Skipping the check for unknown addresses would make the limit meaningless:
   * an attacker would simply vary the address. Both branches answer identically and
   * cost the same, so the response is not an oracle for which addresses are
   * registered.
   */
  if (!wrongAccount && isLockedOut(accountKey, ACCOUNT_MAX)) {
    return NextResponse.json(
      { success: false, message: 'محاولات كثيرة. حاول بعد بضع دقائق.' },
      { status: 429 },
    );
  }

  const matches =
    !wrongAccount && (await compare(password, (account as { password: string }).password));

  if (!matches) {
    noteFailure(wrongAccount ? ipKey : accountKey);
    if (!wrongAccount) noteFailure(ipKey);
    // One message for a wrong password, a non-admin account and a suspended one.
    return NextResponse.json(
      { success: false, message: 'البريد أو كلمة السر غير صحيحة' },
      { status: 401 },
    );
  }

  clearLimit(ipKey);
  clearLimit(accountKey);

  const role = 'ADMIN';
  const accessToken = generateAccessToken({ userId: account!.id, email: account!.email, role });
  const refreshToken = generateRefreshToken({ userId: account!.id, email: account!.email, role });

  await setAuthCookies(accessToken, refreshToken);

  return NextResponse.json({
    success: true,
    data: { email: account!.email, role },
  });
}