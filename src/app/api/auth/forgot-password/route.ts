import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma/client';
import { rateLimit, rateLimitHeaders, clientKey } from '@/lib/security/rate-limit';

const TOKEN_TTL_MINUTES = 30;
const WINDOW_MS = 15 * 60 * 1000;
/** per mailbox: tight, and unaffected by a shared address */
const ACCOUNT_MAX = 3;
/** per address: high enough that one school behind a NAT is not one budget */
const IP_MAX = 60;

function hashToken(token: string): string {
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('PASSWORD_RESET_SECRET or JWT_SECRET is required');
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export async function POST(request: Request) {
  /*
   * Two budgets, because the interesting one is not the address.
   *
   * The per-**account** limit is the real defence: it bounds how fast any single
   * mailbox can be probed, and it survives a NAT because it does not care how many
   * people share the address.
   *
   * The per-**IP** limit used to be the only one, at 3 per 15 minutes. That reads
   * as generous and is not: every student on a school network arrives from the same
   * public address, so the fourth student to forget a password was refused because
   * of the other three. The people it protects against and the people it locks out
   * are not the same people. It is kept, well above one human's needs, to stop a
   * single host spraying addresses.
   */
  const ipLimit = rateLimit(clientKey(request, 'forgot-password'), IP_MAX, WINDOW_MS);

  if (!ipLimit.ok) {
    return Response.json(
      {
        success: false,
        message: 'عدد كبير من الطلبات. يرجى المحاولة بعد قليل',
      },
      { status: 429, headers: rateLimitHeaders(ipLimit, IP_MAX) },
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
    { headers: rateLimitHeaders(ipLimit, IP_MAX) },
  );

  if (!user || user.status !== 'ACTIVE') {
    return genericResponse;
  }

  /*
   * The per-account budget, checked only once the address is known to exist.
   *
   * Placing it after the lookup is deliberate: it must not become an oracle. An
   * address with no account returns the same generic answer without ever being
   * counted, so hammering a made-up address cannot lock a real one out, and cannot
   * be used to discover which addresses are registered.
   */
  const accountLimit = rateLimit(`forgot-password:${user.id}`, ACCOUNT_MAX, WINDOW_MS);

  if (!accountLimit.ok) {
    return Response.json(
      {
        success: false,
        message: 'تم إرسال طلبات كثيرة لهذا البريد. يرجى المحاولة بعد قليل',
      },
      { status: 429, headers: rateLimitHeaders(accountLimit, ACCOUNT_MAX) },
    );
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

  /*
   * Two decisions, not one. Fusing them is what made this endpoint a dead end.
   *
   * **Where the link goes** is a delivery question and must always have an
   * answer. A webhook is the real one. Failing that, the server log is the
   * fallback — and it is a genuinely different exposure from the API response:
   * the log is readable only by whoever can already read the deploy output (the
   * same person who reads the generated admin password), while the response goes
   * to whoever POSTed the request. That asymmetry is the whole point, so log
   * delivery is the default rather than something behind a flag.
   *
   * **Whether the token is echoed in the response** is a testing convenience, and
   * it stays strictly opt-in. It used to be `NODE_ENV !== 'production'`, which
   * failed *open*: with NODE_ENV unset — easy on a container platform — the
   * condition was true and anyone could request a reset for any address and get a
   * working token back. That is account takeover, not a development convenience.
   *
   * The bug this fixes: with no webhook and no flag, the token was created,
   * stored for 30 minutes, and then delivered nowhere, while the response said
   * "سيصلك رابط" — so the flow reported success and did nothing.
   */
  const allowInsecureDevReset = process.env.ALLOW_INSECURE_DEV_RESET === 'true';

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
  } else {
    // No mail service configured. An operator can still complete the flow by
    // reading this line out of the deploy log, which is the same way they get the
    // first admin password. A public deployment should set
    // PASSWORD_RESET_WEBHOOK_URL; until then this is what keeps the button working
    // instead of silently doing nothing.
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log('  │  رابط إعادة تعيين كلمة المرور — يُعرض مرة واحدة │');
    console.log('  ├──────────────────────────────────────────────┤');
    console.log(`  │  ${resetUrl.slice(0, 42).padEnd(42)}│`);
    console.log(`  │  ${resetUrl.slice(42).padEnd(42)}│`);
    console.log('  └──────────────────────────────────────────────┘');
    console.log(`  ${user.email} — صالح ${TOKEN_TTL_MINUTES} دقيقة، ولا يُرسل إلا مرة واحدة`);
    console.log('  (لم يُضبط PASSWORD_RESET_WEBHOOK_URL، فالرابط في السجل فقط)');
    console.log('');
  }

  if (allowInsecureDevReset && !webhook) {
    return Response.json(
      {
        success: true,
        message: 'تم إنشاء رابط إعادة التعيين (وضع التطوير)',
        data: { resetUrl },
      },
      { headers: rateLimitHeaders(ipLimit, IP_MAX) },
    );
  }

  return genericResponse;
}
