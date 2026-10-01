/**
 * FREE vs PAID courses.
 *
 * A course carries `CourseType` (FREE | PAID), which is the teacher's decision
 * when they add it. FREE opens to any signed-in student with no subscription and
 * no payment; PAID needs the matching subscription cell for its subject. Both
 * kinds live side by side in the same subject, which is the case that matters:
 * an access filter written as `subjectId in allowed` cannot express it, because
 * it hides free content from the very students it is free for.
 *
 * This exists because `CourseType` was in the schema and the API but was read by
 * nothing — a FREE course still demanded a subscription.
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
const email = `e2e-freepaid-${Date.now()}@alqimma.test`;
const courseIds = [];
const videoIds = [];
const exerciseIds = [];
const sessionIds = [];
let userId = null;
let studentId = null;

const browser = await chromium.launch();

try {
  const math = await prisma.subject.findUniqueOrThrow({ where: { name: 'MATH' } });
  const level = await prisma.level.findFirstOrThrow();
  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { user: { email: 'teacher@alqimma.com' } },
  });

  const freeCourse = await prisma.course.create({
    data: { teacherId: teacher.id, subjectId: math.id, levelId: level.id, title: 'E2E FREE COURSE', type: 'FREE', isPublished: true },
  });
  const paidCourse = await prisma.course.create({
    data: { teacherId: teacher.id, subjectId: math.id, levelId: level.id, title: 'E2E PAID COURSE', type: 'PAID', isPublished: true },
  });
  courseIds.push(freeCourse.id, paidCourse.id);

  const freeVideo = await prisma.video.create({ data: { courseId: freeCourse.id, title: 'E2E FREE VID', url: '/uploads/video/e2e-free.mp4', isPublished: true } });
  const paidVideo = await prisma.video.create({ data: { courseId: paidCourse.id, title: 'E2E PAID VID', url: '/uploads/video/e2e-paid.mp4', isPublished: true } });
  videoIds.push(freeVideo.id, paidVideo.id);

  const freeEx = await prisma.exercise.create({ data: { courseId: freeCourse.id, title: 'E2E FREE EX', questions: [] } });
  const paidEx = await prisma.exercise.create({ data: { courseId: paidCourse.id, title: 'E2E PAID EX', questions: [] } });
  exerciseIds.push(freeEx.id, paidEx.id);

  const freeLive = await prisma.liveSession.create({ data: { teacherId: teacher.id, courseId: freeCourse.id, title: 'E2E FREE LIVE', status: 'LIVE', scheduledAt: new Date() } });
  const paidLive = await prisma.liveSession.create({ data: { teacherId: teacher.id, courseId: paidCourse.id, title: 'E2E PAID LIVE', status: 'LIVE', scheduledAt: new Date() } });
  sessionIds.push(freeLive.id, paidLive.id);

  const user = await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash(PASSWORD, 12),
      role: 'STUDENT',
      status: 'ACTIVE',
      emailVerified: true,
      student: { create: { firstName: 'E2EFreePaid', lastName: 'Student' } },
    },
    include: { student: true },
  });
  userId = user.id;
  studentId = user.student.id;

  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);

  const listed = async () =>
    page.evaluate(async () => {
      const read = async (url, key) => {
        const res = await fetch(url);
        const json = await res.json().catch(() => null);
        return json?.data?.[key] ?? [];
      };
      const live = await read('/api/live', 'sessions');
      return {
        videos: (await read('/api/videos', 'videos')).map((v) => v.id),
        exercises: (await read('/api/exercises', 'exercises')).map((e) => e.id),
        live: live.map((s) => s.id),
        liveFlags: Object.fromEntries(live.map((s) => [s.id, s.hasAccess])),
        liveJoinable: live.filter((s) => s.hasAccess === true).length,
      };
    });

  const open = (id, kind) =>
    page.evaluate(async ([id, kind]) => (await fetch(`/api/${kind}/${id}`)).status, [id, kind]);

  // --- a student who owns nothing ---
  const none = await listed();
  ok('the FREE video is listed without a subscription', none.videos.includes(freeVideo.id), `videos=${none.videos.length}`);
  ok('the PAID video is not listed', !none.videos.includes(paidVideo.id));
  ok('the FREE exercise is listed', none.exercises.includes(freeEx.id));
  ok('the PAID exercise is not listed', !none.exercises.includes(paidEx.id));
  ok('the FREE live session is listed', none.live.includes(freeLive.id), `sessions=${none.live.length}`);
  // A PAID session stays listed as a locked card so the student is offered the
  // subscribe button. What must not happen is it being *joinable*.
  ok(
    'the PAID live session is listed but locked',
    none.live.includes(paidLive.id) && none.liveFlags?.[paidLive.id] === false,
    `listed=${none.live.includes(paidLive.id)} joinable=${none.liveJoinable}`,
  );

  ok('the FREE video opens', (await open(freeVideo.id, 'videos')) === 200);
  ok('the PAID video is 403', (await open(paidVideo.id, 'videos')) === 403);
  ok('the FREE exercise opens', (await open(freeEx.id, 'exercises')) === 200);
  ok('the PAID exercise is 403', (await open(paidEx.id, 'exercises')) === 403);
  ok('the FREE live room opens', (await open(freeLive.id, 'live')) === 200);
  ok('the PAID live room is 403', (await open(paidLive.id, 'live')) === 403);

  // --- holding one PAID cell opens that cell only, and never closes FREE ---
  await prisma.subscription.create({
    data: {
      studentId,
      subjectId: math.id,
      accessType: 'LIVE',
      status: 'ACTIVE',
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
    },
  });

  const withLive = await listed();
  ok('the PAID live session becomes joinable once LIVE is held', withLive.liveFlags?.[paidLive.id] === true);
  ok('the PAID video is still hidden with only LIVE held', !withLive.videos.includes(paidVideo.id));
  ok('the PAID video is still 403 on a guessed url', (await open(paidVideo.id, 'videos')) === 403);
  ok('the PAID exercise is still 403', (await open(paidEx.id, 'exercises')) === 403);
  ok('the PAID live room now opens', (await open(paidLive.id, 'live')) === 200);
  ok('the FREE video is unaffected', (await open(freeVideo.id, 'videos')) === 200);
  ok('the FREE live room is unaffected', (await open(freeLive.id, 'live')) === 200);

  // --- a teacher can flip the flag, and it takes effect immediately ---
  await prisma.course.update({ where: { id: freeCourse.id }, data: { type: 'PAID' } });
  ok('flipping FREE to PAID closes it at once', (await open(freeVideo.id, 'videos')) === 403, `status=${await open(freeVideo.id, 'videos')}`);

  await prisma.course.update({ where: { id: freeCourse.id }, data: { type: 'FREE' } });
  ok('flipping it back opens it again', (await open(freeVideo.id, 'videos')) === 200);
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the run threw :: ${error.message}`);
} finally {
  await browser.close();

  await prisma.attendance.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.liveSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.video.deleteMany({ where: { id: { in: videoIds } } });
  await prisma.videoProgress.deleteMany({ where: { studentId } }).catch(() => undefined);
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await prisma.payment.deleteMany({ where: { subscription: { studentId } } });
  await prisma.subscription.deleteMany({ where: { studentId } });
  await prisma.enrollment.deleteMany({ where: { studentId } });
  await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();

  const leftover = await new PrismaClient();
  const left = await leftover.user.count({ where: { email: { startsWith: 'e2e-freepaid-' } } });
  await leftover.$disconnect();
  ok('the throwaway student is gone', left === 0, `${left} left`);
}

if (failures > 0) {
  console.error(`\nFAILED ${failures} free/paid check(s)`);
  process.exit(1);
}

console.log('\nALL FREE/PAID COURSE CHECKS PASSED');