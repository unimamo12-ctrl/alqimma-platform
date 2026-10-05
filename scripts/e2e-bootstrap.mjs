/**
 * Bootstrapping a platform that has never been seeded.
 *
 * A deployment whose database was never seeded has no subjects and no levels, and
 * nothing in the app could create either: both routes were GET-only. So "add
 * course" rendered two permanently empty dropdowns and could not be submitted —
 * and there was no way out except a shell and `npm run seed`.
 *
 * This runs that exact state: wipes the catalog, checks the form explains itself,
 * then adds the catalog through the admin UI and confirms a course can finally be
 * created.
 */
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3000';
const PASSWORD = 'password123';

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (condition) console.log(`  PASS  ${label}${detail ? ` :: ${detail}` : ''}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
};

const prisma = new PrismaClient();

/*
 * The empty-catalog state is produced by *intercepting* the two reads rather than
 * by wiping the catalog. Wiping it would orphan the seeded course, and the test
 * would be destructive to the very database it is meant to protect. Only the two
 * temporary rows this run creates are ever deleted.
 */

const adminEmail = `e2e-boot-admin-${Date.now()}@alqimma.test`;
const teacherEmail = `e2e-boot-teacher-${Date.now()}@alqimma.test`;
const TEMP_SUBJECT = 'E2EBOOT';
const TEMP_LEVEL = 'E2EBOTLV';
const created = { subjectId: null, levelId: null, courseId: null };

const hash = await bcrypt.hash(PASSWORD, 12);

await prisma.user.create({
  data: { email: adminEmail, password: hash, role: 'ADMIN', status: 'ACTIVE', emailVerified: true },
});
await prisma.user.create({
  data: {
    email: teacherEmail,
    password: hash,
    role: 'TEACHER',
    status: 'ACTIVE',
    emailVerified: true,
    teacher: { create: { firstName: 'E2E', lastName: 'Boot', subjects: [], levels: [] } },
  },
});

const browser = await chromium.launch();
const session = async (target) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(target);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  return { ctx, page };
};

/** Makes the two catalog reads look empty, for this context only. */
async function fakeEmptyCatalog(page) {
  await page.route('**/api/subjects', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { subjects: [], accessTypes: [] } }),
    }),
  );
  await page.route('**/api/levels', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { levels: [] } }),
    }),
  );
}

try {
  // --- with no catalog the form must explain itself, not show dead dropdowns ---
  {
    const { ctx, page } = await session(teacherEmail);
    await fakeEmptyCatalog(page);
    await page.goto(`${BASE}/teacher/courses`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("دورة جديدة")').click();
    await page.waitForTimeout(900);

    ok(
      'the teacher is told there is no catalog',
      (await page.locator('text=لا توجد مواد أو مستويات').count()) > 0,
    );
    ok(
      'no dead dropdowns are rendered',
      (await page.locator('select').count()) === 0,
      `${await page.locator('select').count()} selects`,
    );
    ok('it names who can fix it', (await page.locator('text=من صلاحيات الإدارة فقط').count()) > 0);
    ok('and links there', (await page.locator('a:has-text("إعداد المواد والمستويات")').count()) > 0);
    await ctx.close();
  }

  // --- the admin adds a subject and a level through the UI ---
  {
    const { ctx, page } = await session(adminEmail);
    await page.goto(`${BASE}/admin/content`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    ok('the catalog tab is the default view', (await page.locator('button:has-text("المواد والمستويات")').count()) > 0);

    await page.locator('input[placeholder*="إنجليزي"]').first().fill(TEMP_SUBJECT);
    await page.locator('input[placeholder*="الرياضيات"]').fill('مادة الاختبار');
    await page.locator('button:has-text("إضافة مادة")').click();
    await page.waitForTimeout(2200);
    ok('a subject can be added from the UI', (await page.locator('text=تمت إضافة المادة').count()) > 0);

    await page.locator('input[placeholder*="إنجليزي"]').nth(1).fill(TEMP_LEVEL);
    await page.locator('button:has-text("إضافة مستوى")').click();
    await page.waitForTimeout(2200);
    ok('a level can be added from the UI', (await page.locator('text=تمت إضافة المستوى').count()) > 0);

    const subject = await prisma.subject.findUnique({ where: { name: TEMP_SUBJECT } });
    const level = await prisma.level.findUnique({ where: { name: TEMP_LEVEL } });
    created.subjectId = subject?.id ?? null;
    created.levelId = level?.id ?? null;
    ok('both rows exist', Boolean(subject) && Boolean(level));

    // the subject must arrive sellable, not configured-but-unbuyable
    const cells = subject ? await prisma.subjectAccess.count({ where: { subjectId: subject.id } }) : 0;
    ok('the new subject got its three price cells', cells === 3, `${cells} cells`);

    await page.locator('input[placeholder*="إنجليزي"]').first().fill(TEMP_SUBJECT);
    await page.locator('button:has-text("إضافة مادة")').click();
    await page.waitForTimeout(1800);
    ok('a duplicate subject is refused', (await page.locator('text=هذه المادة موجودة بالفعل').count()) > 0);
    await ctx.close();
  }

  // --- and a course can finally be created ---
  {
    const { ctx, page } = await session(teacherEmail);
    await page.goto(`${BASE}/teacher/courses`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("دورة جديدة")').click();
    await page.waitForTimeout(900);

    ok('the form is usable once the catalog exists', (await page.locator('select').count()) >= 2);
    await page.locator('input[placeholder*="جبر"]').fill('E2E BOOTSTRAP COURSE');

    // pick the rows this run created, for both selects: the form falls back to the
    // first option, so choosing only the subject would silently attach the course
    // to a seeded level and leave this run's level legitimately unused
    await page.locator('select').first().selectOption({ label: 'مادة الاختبار' });
    await page.locator('select').nth(1).selectOption({ label: TEMP_LEVEL });
    await page.locator('button:has-text("حفظ الدورة")').click();
    await page.waitForTimeout(2500);

    const course = await prisma.course.findFirst({
      where: { title: 'E2E BOOTSTRAP COURSE', subjectId: created.subjectId ?? undefined },
    });
    created.courseId = course?.id ?? null;
    ok('a course can finally be created', Boolean(course), course ? `id=${course.id}` : 'not created');
    ok(
      'it uses both rows this run created',
      course?.levelId === created.levelId,
      `levelId=${course?.levelId} expected=${created.levelId}`,
    );
    await ctx.close();
  }

  // --- guards ---
  {
    const cookie = async (target) =>
      (
        await fetch(`${BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: target, password: PASSWORD }),
        })
      ).headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

    const adminCookie = await cookie(adminEmail);
    const teacherCookie = await cookie(teacherEmail);

    const delSubject = await fetch(`${BASE}/api/admin/subjects/${created.subjectId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    ok('a subject with a course cannot be deleted', delSubject.status === 409, `status=${delSubject.status}`);

    const delLevel = await fetch(`${BASE}/api/admin/levels/${created.levelId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    ok('a level with a course cannot be deleted', delLevel.status === 409, `status=${delLevel.status}`);

    const asTeacher = await fetch(`${BASE}/api/admin/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
      body: JSON.stringify({ name: 'PHYSICSX' }),
    });
    ok('a teacher cannot add a subject', asTeacher.status === 403, `status=${asTeacher.status}`);

    const asTeacherLevel = await fetch(`${BASE}/api/admin/levels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
      body: JSON.stringify({ name: 'X9AM' }),
    });
    ok('a teacher cannot add a level', asTeacherLevel.status === 403, `status=${asTeacherLevel.status}`);
  }
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the run threw :: ${error.message}`);
} finally {
  await browser.close();

  // remove only what this run created, in dependency order
  if (created.courseId) await prisma.course.deleteMany({ where: { id: created.courseId } });
  if (created.subjectId) {
    await prisma.subjectAccess.deleteMany({ where: { subjectId: created.subjectId } });
    await prisma.subject.deleteMany({ where: { id: created.subjectId } });
  }
  if (created.levelId) await prisma.level.deleteMany({ where: { id: created.levelId } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, teacherEmail] } } });

  const residue = await prisma.subject.count({ where: { name: { startsWith: 'E2E' } } });
  ok('nothing this run created is left behind', residue === 0, `${residue} leftover`);

  const subjects = await prisma.subject.count();
  const levels = await prisma.level.count();
  ok('the catalog is intact', subjects >= 5 && levels >= 7, `subjects=${subjects} levels=${levels}`);

  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\nFAILED ${failures} bootstrap check(s)`);
  process.exit(1);
}

console.log('\nALL EMPTY-DEPLOYMENT BOOTSTRAP CHECKS PASSED');