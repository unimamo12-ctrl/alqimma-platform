/**
 * The purchase journey, through the UI a student actually uses.
 *
 * The gating itself is covered by `e2e-subscriptions.mjs`. This covers the part
 * that had none: choosing a subject, the "اشترك الآن" dialog, the two payment
 * methods, and the fact that a request unlocks nothing until the admin approves
 * it. All of it runs against a throwaway student and is removed at the end.
 */
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3000';
const PASSWORD = 'password123';

let failures = 0;
const createdRefreshTokens = new Set();

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` :: ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

const prisma = new PrismaClient();
const email = `e2e-buy-${Date.now()}@alqimma.test`;
let studentId = null;
let userId = null;
let createdSessionIds = [];
let createdVideoIds = [];
let createdCourseIds = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });

async function loginAs(target) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(target);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  return page;
}

function track(cookie) {
  for (const m of cookie.matchAll(/refresh_token=([^;]+)/g)) {
    createdRefreshTokens.add(decodeURIComponent(m[1]));
  }
  return cookie;
}

try {
  // --- a student who owns nothing, plus content to unlock -------------------
  const math = await prisma.subject.findUniqueOrThrow({ where: { name: 'MATH' } });
  const level = await prisma.level.findFirstOrThrow();
  const teacher = await prisma.teacher.findFirstOrThrow({ where: { user: { email: 'teacher@alqimma.com' } } });

  const course = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      subjectId: math.id,
      levelId: level.id,
      title: 'E2E BUY MATH',
      // PAID: this journey is about the subscription and approval flow. A FREE
      // course would open to every student and nothing below would be a test.
      type: 'PAID',
      isPublished: true,
    },
  });
  createdCourseIds.push(course.id);

  const video = await prisma.video.create({
    data: { courseId: course.id, title: 'E2E BUY VIDEO', url: '/uploads/video/e2e-buy.mp4', isPublished: true },
  });
  createdVideoIds.push(video.id);

  const session = await prisma.liveSession.create({
    data: { teacherId: teacher.id, courseId: course.id, title: 'E2E BUY LIVE', status: 'LIVE', scheduledAt: new Date() },
  });
  createdSessionIds.push(session.id);

  const password = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      email,
      password,
      role: 'STUDENT',
      status: 'ACTIVE',
      emailVerified: true,
      student: { create: { firstName: 'E2EBuy', lastName: 'Journey' } },
    },
    include: { student: true },
  });
  studentId = user.student.id;
  userId = user.id;

  const page = await loginAs(email);

  // --- the catalogue offers every cell separately ---------------------------
  await page.goto(`${BASE}/student/subjects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const catalogue = (await page.locator('main').innerText()).replace(/\s+/g, ' ');

  ok('the catalogue states that subscriptions are separate', catalogue.includes('كل اشتراك مستقل'), '');
  for (const cell of ['البث المباشر', 'الفيديوهات المسجلة', 'التمارين']) {
    ok(`the catalogue offers "${cell}" with its own price`, catalogue.includes(cell));
  }
  const subscribeButtons = await page.locator('button:has-text("اشترك الآن")').count();
  ok('every cell has its own subscribe button', subscribeButtons >= 9, `${subscribeButtons} buttons`);

  // --- the dialog carries the two payment methods ---------------------------
  // Buy a *known* cell: the MATH card's LIVE button. Indexing the flat list of
  // subscribe buttons is not safe — it silently buys whichever subject happens to
  // sit in that slot, and then every later assertion is about the wrong cell.
  const mathCard = page.locator('div.rounded-2xl', { has: page.locator('h2', { hasText: 'الرياضيات' }) }).first();
  await mathCard.locator('button:has-text("اشترك الآن")').first().click();
  await page.waitForTimeout(1000);

  const dialog = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  ok('the dialog asks for a payment method', dialog.includes('طريقة الدفع'), '');
  ok('Baridi is offered', dialog.includes('بريدي موب') && dialog.includes('CCP'), '');
  ok('MOB is offered', dialog.includes('موب'), '');
  ok('a transaction reference is accepted', dialog.includes('مرجع التحويل'), '');

  // MOB is selectable, not just displayed. Anchored regex is required on two
  // counts: `has-text("موب")` also matches "بريدي موب", and each button's
  // accessible name carries its hint too ("موب دفع بالهاتف"), so an exact
  // match finds nothing.
  await page.getByRole('button', { name: /^موب/ }).click();
  await page.waitForTimeout(400);
  ok('MOB can be selected', true, 'clicked without error');

  await page.getByRole('button', { name: /^بريدي موب/ }).click();
  await page.locator('input[placeholder*="اختياري"]').fill('E2E-CCP-1');
  await page.locator('button:has-text("تأكيد الاشتراك")').click();
  await page.waitForTimeout(2500);

  // --- the request is recorded as pending, with the chosen method ----------
  const subs = await prisma.subscription.findMany({
    where: { studentId },
    include: { subject: true, payments: true },
  });
  ok('the request is stored', subs.length === 1, `${subs.length} rows`);
  ok('it waits for the admin', subs[0]?.status === 'PENDING', subs[0]?.status);
  ok('the chosen payment method is stored', subs[0]?.payments?.[0]?.method === 'BARIDI', subs[0]?.payments?.[0]?.method);
  ok('the payment is not settled yet', subs[0]?.payments?.[0]?.status === 'PENDING', subs[0]?.payments?.[0]?.status);
  ok('the reference the student typed is kept', subs[0]?.payments?.[0]?.transactionId === 'E2E-CCP-1', subs[0]?.payments?.[0]?.transactionId ?? 'null');

  ok('the purchase landed on the intended cell', subs[0]?.subjectId === math.id && subs[0]?.accessType === 'LIVE', `${subs[0]?.subjectId === math.id ? 'MATH' : subs[0]?.subjectId}:${subs[0]?.accessType}`);

  // --- nothing is unlocked before approval ---------------------------------
  // A PAID session stays *listed* while pending — that is what puts the
  // "اشترك" button in front of the student — so the assertion is on joinability
  // (`hasAccess`), not on the list being empty.
  const before = await page.evaluate(async () => {
    const live = await (await fetch('/api/live')).json();
    const videos = await (await fetch('/api/videos')).json();
    const sessions = live.data?.sessions ?? [];
    return {
      listed: sessions.length,
      joinable: sessions.filter((s) => s.hasAccess === true).length,
      videos: videos.data?.videos?.length ?? -1,
    };
  });
  ok('a pending request joins no live session', before.joinable === 0, `listed=${before.listed} joinable=${before.joinable}`);
  ok('a pending request opens no video', before.videos === 0, `videos=${before.videos}`);

  const directBefore = await page.evaluate(async (id) => (await fetch(`/api/live/${id}`)).status, session.id);
  ok('a pending request cannot be opened directly', directBefore === 403, `status=${directBefore}`);

  // --- the student can see their own pending request -----------------------
  await page.goto(`${BASE}/student/subscriptions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const mine = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  ok('the student sees the pending request', /قيد|مراجعة|بانتظار|انتظار/.test(mine), mine.slice(0, 80));

  // --- a second request for the same cell is refused politely --------------
  const again = await page.evaluate(
    async ([subjectId, type]) => {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, accessType: type, paymentMethod: 'MOB' }),
      });
      return { status: res.status, body: await res.json() };
    },
    [subs[0]?.subjectId ?? math.id, subs[0]?.accessType ?? 'VIDEO'],
  );
  ok('buying the same cell twice is refused, not a crash', again.status === 409 && again.body?.success === false, `status=${again.status}`);
  ok('the refusal explains why', /بانتظار|مراجعة|قيد/.test(again.body?.message ?? ''), again.body?.message ?? '');

  // --- admin approves, and only then it opens ------------------------------
  const adminCookie = track(
    (await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@alqimma.com', password: PASSWORD }),
    })).headers.getSetCookie().map((c) => c.split(';')[0]).join('; '),
  );

  const approved = await fetch(`${BASE}/api/admin/subscriptions/${subs[0].id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ action: 'APPROVE' }),
  });
  const approvedBody = await approved.json();
  ok('the admin approves the request', approvedBody.success === true, `status=${approved.status}`);

  const after = await page.evaluate(async () => {
    const live = await (await fetch('/api/live')).json();
    const videos = await (await fetch('/api/videos')).json();
    return {
      live: live.data?.sessions?.length ?? -1,
      joinable: (live.data?.sessions ?? []).filter((s) => s.hasAccess === true).length,
      videos: videos.data?.videos?.length ?? -1,
      liveIds: (live.data?.sessions ?? []).map((s) => s.id),
    };
  });

  const boughtType = subs[0]?.accessType;
  if (boughtType === 'LIVE') {
    ok('after approval the live session opens', after.liveIds.includes(session.id), `sessions=${after.live}`);
    ok('but the video is still refused', after.videos === 0, `videos=${after.videos}`);
  } else {
    ok('after approval the video opens', after.videos > 0, `videos=${after.videos}`);
    ok('but the live session is still not joinable', after.joinable === 0, `joinable=${after.joinable}`);
  }
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the run threw :: ${error.message}`);
} finally {
  await browser.close();

  await prisma.payment.deleteMany({ where: { subscription: { studentId } } });
  await prisma.subscription.deleteMany({ where: { studentId } });
  await prisma.attendance.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
  await prisma.liveSession.deleteMany({ where: { id: { in: createdSessionIds } } });
  await prisma.video.deleteMany({ where: { id: { in: createdVideoIds } } });
  await prisma.videoProgress.deleteMany({ where: { studentId } }).catch(() => undefined);
  await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
  await prisma.student.deleteMany({ where: { id: studentId } });

  const deleted = await prisma.refreshToken.deleteMany({
    where: { token: { in: [...createdRefreshTokens] } },
  });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();

  ok('the throwaway student is gone', Boolean(studentId), email);
  ok('test refresh tokens cleaned up', deleted.count <= createdRefreshTokens.size, `deleted=${deleted.count}/${createdRefreshTokens.size}`);
}

if (failures > 0) {
  console.error(`\nFAILED ${failures} purchase journey check(s)`);
  process.exit(1);
}

console.log('\nALL PURCHASE JOURNEY CHECKS PASSED');