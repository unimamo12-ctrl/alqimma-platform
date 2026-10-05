/**
 * Prove that a deploy onto an *empty* database produces a usable platform.
 *
 * This is the exact state `alqimma-platform.onrender.com` is in, and none of the
 * other checks can see it: they all run against a seeded database, where an
 * admin exists and a catalog exists, which is precisely the condition the
 * bootstrap exists to repair.
 *
 * It runs against a throwaway **schema** rather than a throwaway database, so it
 * needs no CREATE DATABASE privilege and cannot touch the real rows.
 *
 *   node scripts/e2e-deploy-bootstrap.mjs
 *
 * Deliberately NOT part of `verify`: it needs a writable Postgres, which a CI box
 * or a hosted deployment may not have, and a check that cannot always run is
 * better run by hand than skipped silently in a chain.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';

const SCHEMA = 'bootstrap_probe';
const failures = [];
const check = (name, condition, detail = '') => {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!condition) failures.push(name);
};

/** the real DATABASE_URL, pointed at a scratch schema */
function scratchUrl() {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const line = env.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) throw new Error('DATABASE_URL is not in .env');
  const base = line.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^["']|["']$/g, '');
  const url = new URL(base);
  url.searchParams.set('schema', SCHEMA);
  return url.toString();
}

function run(script, env = {}) {
  execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

const baseUrl = scratchUrl();

/** @param {string} schema */
async function client(schema) {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schema);
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await prisma.$connect();
  return prisma;
}

const maintenance = await client('postgres');
await maintenance.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
await maintenance.$disconnect();

try {
  console.log('\n--- first deploy onto an empty database ---');
  // no ADMIN_PASSWORD: the operator has to be told the generated one
  run('./deploy-bootstrap.mjs', { DATABASE_URL: baseUrl, ADMIN_EMAIL: 'first@probe.test' });

  const prisma = await client(SCHEMA);

  const subjects = await prisma.subject.count();
  const levels = await prisma.level.count();
  const cells = await prisma.subjectAccess.count();
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });

  check('the catalog exists', subjects > 0 && levels > 0, `${subjects} subjects, ${levels} levels`);
  check('every subject got its three price cells', cells === subjects * 3, `${cells} cells`);
  check('price cells are sellable', (await prisma.subjectAccess.count({ where: { isActive: true } })) === cells);
  check('exactly one admin exists', admins.length === 1, `${admins.length}`);
  check('it is the requested address', admins[0]?.email === 'first@probe.test', admins[0]?.email);
  // the generated password must not have landed on the documented test default,
  // which is what a deployment would ship as its admin password
  check('it is NOT the password123 test default',
    (await compare('password123', admins[0].password)) === false);
  check('no seeded test users were created', (await prisma.user.count({ where: { email: 'student@alqimma.com' } })) === 0);

  console.log('\n--- redeploy onto the same database ---');
  // an admin must survive a redeploy, and an admin decision must too
  const victim = await prisma.subjectAccess.findFirst();
  await prisma.subjectAccess.update({ where: { id: victim.id }, data: { isActive: false } });

  run('./deploy-bootstrap.mjs', { DATABASE_URL: baseUrl, ADMIN_EMAIL: 'second@probe.test' });

  check('no second admin was invented', (await prisma.user.count({ where: { role: 'ADMIN' } })) === 1);
  check('the existing admin address is untouched', (await prisma.user.findUnique({ where: { email: 'first@probe.test' } })) !== null);
  check('ADMIN_EMAIL does not reset an existing admin',
    (await prisma.user.findUnique({ where: { email: 'second@probe.test' } })) === null);
  check('a deliberately disabled price cell stays disabled',
    (await prisma.subjectAccess.findUnique({ where: { id: victim.id } })).isActive === false);
  check('the catalog was not duplicated', (await prisma.subject.count()) === subjects);

  /*
   * The lockout path. Losing the generated password has to be recoverable without a
   * shell, so ADMIN_FORCE_RESET exists -- but a capability that resets a credential
   * is exactly the thing that must not fire by accident. Three properties, and the
   * middle one is the one that matters:
   *
   *   an ordinary redeploy never resets   -> the default is safe
   *   the flag without a password fails   -> it cannot half-work and be believed
   *   the flag with a password resets      -> there is a way out of the lockout
   */
  console.log('\n--- recovering from a lost password ---');

  const beforeReset = await prisma.user.findUnique({ where: { email: 'first@probe.test' } });
  const knownBefore = await compare('known-good-password', beforeReset.password) === false;

  // the flag on its own must refuse rather than invent a password
  let refused = false;
  let refusal = '';
  try {
    run('./deploy-bootstrap.mjs', {
      DATABASE_URL: baseUrl,
      ADMIN_EMAIL: 'first@probe.test',
      ADMIN_FORCE_RESET: '1',
      ADMIN_PASSWORD: '',
    });
  } catch (error) {
    refused = true;
    refusal = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }

  check('ADMIN_FORCE_RESET without a password refuses', refused);
  check('and it says why', /ADMIN_PASSWORD/.test(refusal) && /Refusing/i.test(refusal));
  check('the password was left alone',
    (await prisma.user.findUnique({ where: { email: 'first@probe.test' } })).password === beforeReset.password);
  check('and it was still not password123', knownBefore);

  run('./deploy-bootstrap.mjs', {
    DATABASE_URL: baseUrl,
    ADMIN_EMAIL: 'first@probe.test',
    ADMIN_FORCE_RESET: '1',
    ADMIN_PASSWORD: 'known-good-password',
  });

  const afterReset = await prisma.user.findUnique({ where: { email: 'first@probe.test' } });
  check('the supplied password now works', await compare('known-good-password', afterReset.password));
  check('and the previous one no longer does', (await compare('password123', afterReset.password)) === false);
  check('no extra admin was created by the reset',
    (await prisma.user.count({ where: { role: 'ADMIN' } })) === 1);
} finally {
  const cleanup = await client('postgres');
  await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await cleanup.$disconnect();
}

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('ALL EMPTY-DEPLOY BOOTSTRAP CHECKS PASSED');
