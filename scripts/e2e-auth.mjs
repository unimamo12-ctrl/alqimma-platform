/**
 * Account creation and sign-in, as an applicant actually meets them.
 *
 * Both bugs here were user-visible and neither threw a stack trace:
 *
 *  - the register page rendered the API's `message` verbatim, and a ZodError's
 *    own message is the serialised issue array, so a student who mistyped the
 *    password confirmation saw `[ { "code": "custom", "path": ["confirmPassword"],
 *    "message": "كلمتا المرور غير متطابقتين" } ]` instead of the sentence;
 *  - the login route identified a wrong password by searching the Arabic message
 *    for `غير صحيحة`, so a *suspended* account missed that branch and was
 *    answered with HTTP 500 — an ordinary outcome reported as a server fault,
 *    and a status the client reads as "retry later" rather than "disabled".
 */
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3000';
const PASSWORD = 'password123';

let failures = 0;
function ok(label, condition, detail = '') {
  if (condition) console.log(`  PASS  ${label}${detail ? ` :: ${detail}` : ''}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

const prisma = new PrismaClient();
const stamp = Date.now();
const freshEmail = `e2e-auth-${stamp}@alqimma.test`;
const blockedEmail = `e2e-auth-blocked-${stamp}@alqimma.test`;
const badEmail = `not-an-email-${stamp}`;
const created = [];

const browser = await chromium.launch();

async function api(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

try {
  // --- what the applicant is shown -----------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("طالب")').first().click();

    const names = page.locator('input[type="text"]');
    await names.nth(0).fill('مطابق');
    await names.nth(1).fill('للتجربة');
    await page.locator('input[type="email"]').fill(freshEmail);
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill(PASSWORD);
    await pw.nth(1).fill('a-different-password');
    await page.locator('button:has-text("إنشاء الحساب")').click();
    await page.waitForTimeout(2000);

    const alert = (await page.locator('[role="alert"], .bg-red-50, .text-red').allInnerTexts().catch(() => []))
      .join(' | ')
      .replace(/\s+/g, ' ')
      .trim();

    ok('a mismatch shows the Arabic sentence', alert.includes('كلمتا المرور غير متطابقتين'), alert.slice(0, 120));
    ok(
      'no raw JSON is shown to the applicant',
      !/[{}[\]"]/.test(alert),
      alert.includes('"') ? 'message contained JSON' : 'clean',
    );

    // now do it properly
    await pw.nth(1).fill(PASSWORD);
    await page.locator('button:has-text("إنشاء الحساب")').click();
    await page.waitForTimeout(2500);
    ok('a correct form registers', new URL(page.url()).pathname === '/student', new URL(page.url()).pathname);
    await ctx.close();
  }

  const user = await prisma.user.findUnique({ where: { email: freshEmail } });
  created.push(user?.id);
  ok('the account exists in the database', Boolean(user), user?.role ?? 'missing');

  // --- the API must not leak a Zod message either --------------------------
  {
    const res = await api('/api/auth/register', {
      email: badEmail,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      role: 'STUDENT',
      firstName: 'اسم',
      lastName: 'جديد',
    });
    ok('a malformed email is rejected', res.status === 400, `status=${res.status}`);
    ok('the API message is prose, not JSON', !/[{}"]/.test(res.body?.message ?? ''), (res.body?.message ?? '').slice(0, 90));
  }

  // --- signing in ------------------------------------------------------------
  {
    const res = await api('/api/auth/login', { email: freshEmail, password: PASSWORD });
    ok('the new account can sign in', res.status === 200, `status=${res.status}`);
  }

  {
    const res = await api('/api/auth/login', { email: freshEmail, password: 'wrong-password' });
    ok('a wrong password is 401', res.status === 401, `status=${res.status}`);
    ok('and says so in Arabic', /غير صحيحة/.test(res.body?.message ?? ''), res.body?.message ?? '');
  }

  // --- a suspended account is 403, not 500 ----------------------------------
  {
    const blocked = await prisma.user.create({
      data: {
        email: blockedEmail,
        password: await bcrypt.hash(PASSWORD, 12),
        role: 'STUDENT',
        status: 'SUSPENDED',
        emailVerified: true,
        student: { create: { firstName: 'موقوف', lastName: 'للتجربة' } },
      },
    });
    created.push(blocked.id);

    const res = await api('/api/auth/login', { email: blockedEmail, password: PASSWORD });
    ok('a suspended account is 403, not 500', res.status === 403, `status=${res.status}`);
    ok(
      'and the message is the Arabic one',
      /غير نشط/.test(res.body?.message ?? ''),
      res.body?.message ?? '',
    );
  }

  // --- the seeded accounts still sign in -------------------------------------
  {
    const res = await api('/api/auth/login', { email: 'student@alqimma.com', password: PASSWORD });
    ok('the seeded student still signs in', res.status === 200, `status=${res.status}`);

    // a wrong password, but long enough to pass the schema. A 4-character value
    // is a malformed request (400) and never reaches the credential check, so
    // it would assert nothing about sign-in.
    const wrong = await api('/api/auth/login', {
      email: 'student@alqimma.com',
      password: 'definitely-not-the-password',
    });
    ok('a seeded account with a wrong password is 401', wrong.status === 401, `status=${wrong.status}`);
  }
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the run threw :: ${error.message}`);
} finally {
  await browser.close();
  if (created.length) {
    await prisma.student.deleteMany({ where: { userId: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  }
  await prisma.$disconnect();

  const left = await prisma.user.count({ where: { email: { startsWith: 'e2e-auth' } } });
  ok('nothing this run created is left behind', left === 0, `${left} leftover`);
}

if (failures > 0) {
  console.error(`\nFAILED ${failures} auth check(s)`);
  process.exit(1);
}

console.log('\nALL AUTH CHECKS PASSED');