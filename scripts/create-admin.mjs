/**
 * Create or reset an admin account.
 *
 * `/api/auth/register` only accepts STUDENT and TEACHER, which is deliberate:
 * self-service admin creation would hand the whole platform to anyone who signs
 * up. That leaves an admin creatable only from a shell, which is exactly what a
 * deployment that never ran `npm run seed` is missing — it has no way in at all.
 *
 *   node scripts/create-admin.mjs
 *   node scripts/create-admin.mjs you@example.com 'S3cret-pass'
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin.mjs
 *
 * The password is never echoed. If it is omitted, one is generated and printed
 * once, so a weak default never gets typed into a shell history by accident.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const SALT_ROUNDS = 12;

const prisma = new PrismaClient();

const argEmail = process.argv[2];
const argPassword = process.argv[3];

const email = (argEmail ?? process.env.ADMIN_EMAIL ?? 'admin@alqimma.com').trim().toLowerCase();
const generated = !argPassword && !process.env.ADMIN_PASSWORD;
const password = argPassword ?? process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString('base64url');

// the same shape the login route accepts, so a bad email is caught here rather
// than as an unexplained 401 later
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`بريد غير صالح: ${email}`);
  await prisma.$disconnect();
  process.exit(1);
}

const hashed = await bcrypt.hash(password, SALT_ROUNDS);

// upsert rather than create: re-running this is how an operator recovers access,
// and it must not fail just because the account is already there
const admin = await prisma.user.upsert({
  where: { email },
  update: { password: hashed, role: 'ADMIN', status: 'ACTIVE', emailVerified: true },
  create: { email, password: hashed, role: 'ADMIN', status: 'ACTIVE', emailVerified: true },
});

console.log(`تم إنشاء/تحديث حساب مدير: ${admin.email}`);
if (generated) {
  console.log(`كلمة المرور (ستظهر مرة واحدة): ${password}`);
} else {
  console.log('كلمة المرور: كما مرّرتها');
}

const subjects = await prisma.subject.count();
const levels = await prisma.level.count();

if (subjects === 0 || levels === 0) {
  console.log('\n⚠ الكتالوج فارغ — لا يمكن إنشاء دورة قبل ضبطه:');
  console.log('  لوحة الإدارة ← المحتوى ← المواد والمستويات');
  console.log('  أو: node scripts/seed-catalog.mjs');
}

await prisma.$disconnect();