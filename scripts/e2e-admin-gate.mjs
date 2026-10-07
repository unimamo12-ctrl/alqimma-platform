/**
 * The admin door.
 *
 * `/api/admin/panel-access` used to take a password alone and try it against every
 * ADMIN in turn. Two things were wrong with that, and only one of them was the
 * security bug the rate limiter was patched for:
 *
 * - **Nobody said who they were.** Any admin's password opened the panel, so two
 *   operators shared one secret, and the number of guesses available grew with the
 *   number of admins on the platform. It also compared against every hash in turn,
 *   so the work per attempt scaled with the roster.
 * - **`role: 'ADMIN'` became load-bearing.** Looking the address up among *all*
 *   users would hand a teacher or a student an ADMIN session the moment they typed
 *   their own real credentials. The old password-only field made that impossible by
 *   accident; the new one has to make it impossible on purpose.
 *
 * The escalation cases are the reason this file exists, so they are asserted with
 * real credentials for a real student and a real teacher rather than a fixture. A
 * test that used a made-up non-admin account would pass even if the role check were
 * simply missing.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PROBE_ADMIN = 'e2e-gate-admin@alqimma.com';
const PROBE_PASSWORD = 'gate-probe-7hd!';
const SALT_ROUNDS = 12;

const prisma = new PrismaClient();
let failures = 0;

function ok(label, condition, detail = '') {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!condition) failures += 1;
}

async function gate(payload) {
  const res = await fetch(`${BASE}/api/admin/panel-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  let who = null;
  if (res.ok) {
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } });
    if (me.ok) who = (await me.json())?.data?.user?.email ?? null;
  }
  const json = await res.json().catch(() => null);
  return { status: res.status, who, message: json?.message ?? '' };
}

try {
  const created = await prisma.user.create({
    data: {
      email: PROBE_ADMIN,
      password: await bcrypt.hash(PROBE_PASSWORD, SALT_ROUNDS),
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
    select: { id: true },
  });

  console.log('\n--- the intended way in ---');
  const good = await gate({ email: PROBE_ADMIN, password: PROBE_PASSWORD });
  ok('a named admin with the right password gets in', good.status === 200, good.message);
  ok('and it is that account', good.who === PROBE_ADMIN, String(good.who));

  const shouty = await gate({ email: PROBE_ADMIN.toUpperCase(), password: PROBE_PASSWORD });
  ok('the address is matched case-insensitively', shouty.status === 200, `status=${shouty.status}`);

  const spaced = await gate({ email: `  ${PROBE_ADMIN} `, password: PROBE_PASSWORD });
  ok('a padded address still works', spaced.status === 200, `status=${spaced.status}`);

  console.log('\n--- what must not work ---');
  const wrongPassword = await gate({ email: PROBE_ADMIN, password: 'definitely-not-it' });
  ok('a wrong password is refused', wrongPassword.status === 401, `status=${wrongPassword.status}`);

  const wrongAddress = await gate({ email: 'not-an-admin@alqimma.com', password: PROBE_PASSWORD });
  ok('the right password under an unknown address is refused', wrongAddress.status === 401, `status=${wrongAddress.status}`);

  /*
   * The escalation cases. Both fields are genuine logins; only the role differs.
   * If either returns 200, a student has just become an admin.
   */
  const student = await gate({ email: 'student@alqimma.com', password: 'password123' });
  ok('a STUDENT cannot reach the panel with their own credentials', student.status === 401, `status=${student.status}`);

  const teacher = await gate({ email: 'teacher@alqimma.com', password: 'password123' });
  ok('nor can a TEACHER', teacher.status === 401, `status=${teacher.status}`);

  await prisma.user.update({
    where: { id: created.id },
    data: { status: 'SUSPENDED' },
  });
  const suspended = await gate({ email: PROBE_ADMIN, password: PROBE_PASSWORD });
  ok('a suspended admin is refused', suspended.status === 401, `status=${suspended.status}`);
  await prisma.user.update({ where: { id: created.id }, data: { status: 'ACTIVE' } });

  // one message for every refusal, or the endpoint reveals which addresses are admins
  ok(
    'every refusal says the same thing',
    wrongPassword.message === wrongAddress.message &&
      wrongAddress.message === student.message &&
      student.message === teacher.message &&
      suspended.message === wrongPassword.message,
    `"${wrongPassword.message}"`,
  );

  console.log('\n--- malformed input ---');
  ok('a missing password is a 400', (await gate({ email: PROBE_ADMIN })).status === 400);
  ok('a missing address is a 400', (await gate({ password: PROBE_PASSWORD })).status === 400);
  ok('an unparseable address is a 400', (await gate({ email: 'nonsense', password: 'x' })).status === 400);
  ok('an empty body is a 400', (await gate({})).status === 400);
} finally {
  await prisma.user.deleteMany({ where: { email: PROBE_ADMIN } });
  await prisma.$disconnect();
}

console.log('');
if (failures > 0) {
  console.error(`FAILED ${failures} admin-gate check(s)`);
  process.exit(1);
}
console.log('ALL ADMIN-GATE CHECKS PASSED');