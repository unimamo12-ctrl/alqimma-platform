/**
 * A teacher with no courses must be able to start one.
 *
 * Content is attached to a course, so a course-less teacher cannot add a video,
 * an exercise, a file or a broadcast. The four pages that need a course picker
 * used to dead-end: `/teacher/live` said "create a course first from the control
 * panel" — and the control panel had no course form anywhere, so the instruction
 * was impossible to follow — while the other three showed an empty dropdown with
 * no explanation at all.
 *
 * This checks each one offers a notice *and* a working route out, and that the
 * route out lands on a form that can actually create a course.
 */
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3000';
const PASSWORD = 'password123';

let failures = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` :: ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

const prisma = new PrismaClient();
const email = `e2e-nocourse-${Date.now()}@alqimma.test`;
let userId = null;
let createdCourseId = null;

const browser = await chromium.launch();

try {
  const user = await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash(PASSWORD, 12),
      role: 'TEACHER',
      status: 'ACTIVE',
      emailVerified: true,
      teacher: { create: { firstName: 'E2ENoCourses', lastName: 'Teacher', subjects: ['MATH'], levels: ['3AM'] } },
    },
    include: { teacher: true },
  });
  userId = user.id;

  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);

  const mine = await prisma.course.count({ where: { teacherId: user.teacher.id } });
  ok('the test teacher really has no courses', mine === 0, `${mine} courses`);

  // every page that asks for a course has to offer a way to make one
  const pages = [
    ['/teacher/live', 'button:has-text("بث جديد")'],
    ['/teacher/videos', 'button:has-text("إضافة فيديو")'],
    ['/teacher/exercises', 'button:has-text("إضافة تمرين")'],
    ['/teacher/files', 'button:has-text("إضافة ملف")'],
  ];

  for (const [route, opener] of pages) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const trigger = page.locator(opener).first();
    if (await trigger.count()) await trigger.click();
    await page.waitForTimeout(1000);

    const notice = await page.locator('text=لا توجد دورات بعد').count();
    const wayOut = await page.locator('a:has-text("إنشاء دورة الآن")').count();
    const deadDropdown = await page.locator('select option', { hasText: 'اختر الدورة' }).count();

    ok(`${route} explains there are no courses`, notice > 0, `notice=${notice}`);
    ok(`${route} offers a way out`, wayOut > 0, `links=${wayOut}`);
    ok(`${route} does not leave a dead course dropdown`, deadDropdown === 0, `deadDropdown=${deadDropdown}`);
  }

  // the way out has to lead somewhere that works
  await page.goto(`${BASE}/teacher/videos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("إضافة فيديو")').first().click();
  await page.waitForTimeout(800);
  await page.locator('a:has-text("إنشاء دورة الآن")').click();
  await page.waitForTimeout(2000);
  ok('the notice leads to the courses page', page.url().endsWith('/teacher/courses'), page.url());

  await page.locator('button:has-text("دورة جديدة")').click();
  await page.waitForTimeout(800);
  ok('a usable course form is on screen', (await page.locator('input[placeholder*="جبر"]').count()) > 0);

  // and it really does unblock the teacher
  await page.locator('input[placeholder*="جبر"]').fill('E2E UNBLOCK');
  await page.getByRole('button', { name: /^مجاني/ }).click();
  await page.locator('button:has-text("حفظ الدورة")').click();
  await page.waitForTimeout(2500);

  const created = await prisma.course.findFirst({ where: { title: 'E2E UNBLOCK', teacherId: user.teacher.id } });
  createdCourseId = created?.id ?? null;
  ok('the course can be created from there', Boolean(created), created ? `type=${created.type}` : 'not created');

  await page.goto(`${BASE}/teacher/live`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("بث جديد")').click();
  await page.waitForTimeout(1000);
  const stillStuck = await page.locator('text=لا توجد دورات بعد').count();
  const courseOptions = await page.locator('select option').filter({ hasText: 'E2E UNBLOCK' }).count();
  ok('the dead end is gone once a course exists', stillStuck === 0, `notice=${stillStuck}`);
  ok('the new course is selectable', courseOptions > 0, `options=${courseOptions}`);
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the run threw :: ${error.message}`);
} finally {
  await browser.close();

  if (createdCourseId) {
    await prisma.liveSession.deleteMany({ where: { courseId: createdCourseId } });
    await prisma.video.deleteMany({ where: { courseId: createdCourseId } });
    await prisma.course.deleteMany({ where: { id: createdCourseId } });
  }
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();

  const check = new PrismaClient();
  const left = await check.user.count({ where: { email: { startsWith: 'e2e-nocourse-' } } });
  const leftCourses = await check.course.count({ where: { title: 'E2E UNBLOCK' } });
  await check.$disconnect();
  ok('the throwaway teacher is gone', left === 0, `${left} left`);
  ok('the throwaway course is gone', leftCourses === 0, `${leftCourses} left`);
}

if (failures > 0) {
  console.error(`\nFAILED ${failures} no-courses check(s)`);
  process.exit(1);
}

console.log('\nALL NO-COURSES CHECKS PASSED');