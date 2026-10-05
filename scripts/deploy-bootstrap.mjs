/**
 * Make a deployment usable by pressing Deploy and nothing else.
 *
 * The state this exists for is real and measured: `alqimma-platform.onrender.com`
 * answered `/api/subjects` and `/api/levels` with `[]`, so the catalog was empty,
 * no admin existed, and `npm run seed` had never run. There was no way in from the
 * browser — `/api/auth/register` only accepts STUDENT and TEACHER on purpose — so
 * the only recovery was a shell.
 *
 *   node scripts/deploy-bootstrap.mjs        # also runs from `npm run build`
 *
 *   ADMIN_EMAIL=you@example.com              # optional, defaults to admin@alqimma.com
 *   ADMIN_PASSWORD='a password you chose'   # optional, generated + printed if omitted
 *   SKIP_BOOTSTRAP=1                         # opt out entirely (CI, local dry builds)
 *
 * Two rules make it safe to run on *every* deploy, which is the whole point:
 *
 * 1. **It never resets a password that already exists.** `create-admin.mjs` is an
 *    upsert, so wiring it into a build would silently reassign the admin's
 *    password on every single deploy. Here an account is only created when the
 *    platform has no admin at all, and an existing account keeps its password.
 * 2. **It repairs, it does not restore.** `seedCatalog({ force: true })` rewrites
 *    `SubjectAccess.isActive` and the subject labels, which is right for a test
 *    fixture and wrong here: it would undo an admin who deliberately deactivated a
 *    price cell, silently, on the next deploy. This passes `force: false`, so
 *    missing rows are created and existing rows are left alone.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedCatalog } from './seed-catalog.mjs';

const SALT_ROUNDS = 12;
const MIGRATE_ATTEMPTS = 3;

const say = (line) => console.log(`[bootstrap] ${line}`);

if (process.env.SKIP_BOOTSTRAP === '1') {
  say('SKIP_BOOTSTRAP=1, doing nothing');
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  // A build with no database is a legitimate state (a lint-only CI job). Failing
  // here would break that for no benefit; the app itself will still need one.
  say('no DATABASE_URL, skipping migrations and data checks');
  process.exit(0);
}

/*
 * Migrations run here rather than being left to the dashboard's build command,
 * because "press Deploy" is the only interaction this is designed around. A
 * failed migration must fail the build: shipping an app against a schema it does
 * not match turns every query into a 500 that is very hard to read.
 *
 * The Prisma CLI is invoked through `node <cli>` rather than `npx prisma`, because
 * `npx` is `npx.cmd` on Windows and `execFileSync` cannot execute a `.cmd` without
 * a shell -- so the `npx` form fails locally while working on Render, which is the
 * worst kind of difference to discover during a deploy.
 *
 * Retried because the first connection on a freshly-provisioned container can be
 * refused while the database finishes waking up.
 */
// `fileURLToPath`, not `url.pathname`: the project path contains a space, and the
// URL form percent-encodes it into a filename that does not exist.
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));

for (let attempt = 1; ; attempt += 1) {
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { stdio: 'inherit' });
    break;
  } catch (error) {
    if (attempt >= MIGRATE_ATTEMPTS) {
      console.error(`[bootstrap] prisma migrate deploy failed after ${attempt} attempts`);
      throw error;
    }
    console.warn(`[bootstrap] migrate attempt ${attempt} failed, retrying in 5s`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

const prisma = new PrismaClient();

/* ---------------------------------------------------------------- catalog */

const subjectsBefore = await prisma.subject.count();
const levelsBefore = await prisma.level.count();

if (subjectsBefore === 0 || levelsBefore === 0) {
  const result = await seedCatalog(prisma, { force: false });
  say(`catalog was empty (${subjectsBefore} subjects, ${levelsBefore} levels) -> seeded ` +
      `${result.subjects} subjects, ${result.levels} levels, ${result.priceCells} price cells`);
} else {
  say(`catalog present (${subjectsBefore} subjects, ${levelsBefore} levels), left untouched`);
}

/* ------------------------------------------------------------------ admin */

const email = (process.env.ADMIN_EMAIL ?? 'admin@alqimma.com').trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`[bootstrap] ADMIN_EMAIL is not a valid address: ${email}`);
  await prisma.$disconnect();
  process.exit(1);
}

const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });

/*
 * The escape hatch, and the gap it closes.
 *
 * Without it, an operator who loses the generated password has no way back: the
 * default path deliberately refuses to touch an existing account, which is the
 * only thing standing between a push and a silently reassigned admin credential.
 * So the reset has to be *possible* -- it just cannot be the default.
 *
 * `ADMIN_FORCE_RESET=1` plus `ADMIN_PASSWORD` resets the account named by
 * `ADMIN_EMAIL`. Both are required:
 *
 * - the flag alone is refused rather than quietly generating a password nobody
 *   knows, because a build that reports success while changing nothing is how an
 *   operator ends up locked out while believing they reset it;
 * - a generated password is not offered on this path, for the same reason.
 */
const forceReset = ['1', 'true'].includes(String(process.env.ADMIN_FORCE_RESET ?? '').toLowerCase());
const supplied = process.env.ADMIN_PASSWORD;

if (forceReset && !supplied) {
  console.error('[bootstrap] ADMIN_FORCE_RESET is set but ADMIN_PASSWORD is empty.');
  console.error('[bootstrap] Refusing to reset: set ADMIN_PASSWORD to the password you want,');
  console.error('[bootstrap] then deploy again. Not generating one -- an unknown password is not a reset.');
  await prisma.$disconnect();
  process.exit(1);
}

if (adminCount > 0 && !forceReset) {
  // The common case, and the one that must stay silent: redeploys are frequent and
  // an operator reading a build log should not see a credential every time.
  say(`${adminCount} admin account(s) already exist, no account created`);
} else {
  const generated = !supplied;
  const password = supplied ?? crypto.randomBytes(18).toString('base64url');
  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (forceReset && adminCount > 0) {
    say(`ADMIN_FORCE_RESET is set: resetting the password for ${email}`);
  }

  await prisma.user.upsert({
    where: { email },
    update: {
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      // The password is written here only when it is ours to write: a brand new
      // account, or an explicit force-reset. An ordinary redeploy never reaches
      // this branch at all, so a live operator password is never overwritten.
      ...(existing && !forceReset ? {} : { password: hashed }),
    },
    create: { email, password: hashed, role: 'ADMIN', status: 'ACTIVE', emailVerified: true },
  });

  if (forceReset && adminCount > 0) {
    say(`password for ${email} has been reset to the ADMIN_PASSWORD value`);
  } else {
    say(`created the first admin account: ${email}`);
  }

  if (generated) {
    // Printed once, into a log only the dashboard owner can read. The alternative
    // -- requiring ADMIN_PASSWORD up front -- is stricter, but it turns a working
    // deploy into a failed one over a missing env var, and the credential has to
    // reach the operator somehow.
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log('  │  كلمة مرور لوحة الإدارة — تُعرض مرة واحدة    │');
    console.log('  ├──────────────────────────────────────────────┤');
    console.log(`  │  ${password.padEnd(42)}│`);
    console.log('  └──────────────────────────────────────────────┘');
    console.log(`  ${email} / كلمة المرور أعلاه — احفظها ثم غيّرها من /admin/password`);
    console.log('');
  } else if (!forceReset) {
    say('password taken from ADMIN_PASSWORD as supplied');
  }

  if (forceReset) {
    // A reset flag left switched on is the dangerous state, not the reset itself:
    // it silently reassigns the password on every later deploy, including one
    // triggered by someone else pushing a commit. Say so on every build, and say
    // it last, so it is the line left in the log.
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log('  │  ⚠ ADMIN_FORCE_RESET ما زال مفعّلاً            │');
    console.log('  │  احذفه من Environment فورًا وإلا ستُعاد       │');
    console.log('  │  كلمة المرور عند كل نشر قادم.                 │');
    console.log('  └──────────────────────────────────────────────┘');
    console.log('');
  }
}

const after = {
  subjects: await prisma.subject.count(),
  levels: await prisma.level.count(),
  admins: await prisma.user.count({ where: { role: 'ADMIN' } }),
};

await prisma.$disconnect();

say(`ready: ${after.subjects} subjects, ${after.levels} levels, ${after.admins} admin(s)`);
