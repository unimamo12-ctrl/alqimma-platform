import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const prisma = new PrismaClient();
const failures = [];
const check = (n, c, x = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ` :: ${x}` : ''}`);
  if (!c) failures.push(n);
};

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--auto-select-desktop-capture-source=Entire screen',
    '--allow-http-screen-capture',
  ],
});
const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
ctx.on('dialog', (d) => d.accept());

const login = async (email) => {
  const res = await ctx.request.post(`${BASE}/api/auth/login`, {
    data: { email, password: 'password123' },
  });
  return (await res.json()).data?.user;
};

const teacher = await login('teacher@alqimma.com');
check('teacher logged in', teacher?.role === 'TEACHER', teacher?.role);

const teacherPage = await ctx.newPage();
const errors = [];
teacherPage.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|DevTools|preload/i.test(m.text())) errors.push(m.text());
});
teacherPage.on('pageerror', (e) => errors.push(e.message));

// create a live session through the real API
const coursesRes = await ctx.request.get(`${BASE}/api/courses`);
const courses = await coursesRes.json();
// The seeded course by id, not `courses[0]`. The list is ordered createdAt desc,
// so any stray course — a leftover from a probe, or one a test forgot to clean
// up — silently becomes "the teacher's course", and the run then measures the
// wrong subject and the wrong FREE/PAID flag instead of failing.
const courseId =
  courses.data?.courses?.find((c) => c.id === 'course-algebra-3am')?.id ??
  courses.data?.courses?.[0]?.id;
check('teacher has a course', Boolean(courseId), courseId ?? JSON.stringify(courses).slice(0, 200));
const createRes = await ctx.request.post(`${BASE}/api/live`, {
  data: { courseId, title: 'RECORD E2E', startNow: true },
});
const created = await createRes.json();
const sessionId = created?.data?.session?.id;
check('live session created', Boolean(sessionId), `status=${createRes.status()} ${JSON.stringify(created).slice(0, 200)}`);

await teacherPage.goto(`${BASE}/teacher/live/${sessionId}`, { waitUntil: 'networkidle', timeout: 90_000 });
await teacherPage.waitForTimeout(3000);

// the teacher must turn the camera on first, exactly like a human would
const cameraBtn = teacherPage.locator('button[title="الكاميرا"]');
if ((await cameraBtn.count()) > 0) await cameraBtn.first().click();
await teacherPage.waitForTimeout(2500);

const recordingBtn = teacherPage.locator('button[title="بدء التسجيل"]');
check('record button is available', (await recordingBtn.count()) === 1);
await recordingBtn.first().click();
await teacherPage.waitForTimeout(1000);

check(
  'teacher sees recording indicator',
  (await teacherPage.locator('text=يتم التسجيل').count()) > 0,
);
check(
  'record button switched to stop label',
  (await teacherPage.locator('button[title="إيقاف التسجيل وحفظه"]').count()) === 1,
);

// record a few seconds of real media
await teacherPage.waitForTimeout(6000);

const studentsBefore = await (
  await ctx.request.get(`${BASE}/api/videos?all=1`)
).json();
const beforeCount = studentsBefore.data.videos.filter((v) => v.title.includes('تسجيل')).length;

// end the class -> must save the recording then land on /teacher/videos
await teacherPage.locator('button:has-text("إنهاء الحصة")').first().click();
await teacherPage.waitForURL(/\/teacher\/videos/, { timeout: 90_000 });
check('ending the class redirects to /teacher/videos', teacherPage.url().includes('/teacher/videos'), teacherPage.url());

await teacherPage.waitForLoadState('networkidle', { timeout: 60_000 });
await teacherPage.waitForTimeout(1500);

const notice = await teacherPage.evaluate(() => document.body.innerText);
const noticeLine = notice.split('\n').find((l) => /تسجيل|تعذّر|حفظ/.test(l)) ?? '';

/*
 * Two steps, deliberately. The recording lands as a draft and only reaches the
 * students after the teacher publishes it, so a bad take is caught before a
 * class sees it. The round trip through hide/publish is also what proves the
 * teacher's control over visibility actually works in both directions.
 */
check('recording is saved as a draft', (await teacherPage.locator('text=مسودة').count()) > 0, noticeLine.slice(0, 160));
check('the teacher is shown the publish action', (await teacherPage.locator('text=قبول ونشر').count()) > 0);

const studentCtx = await browser.newContext();
await studentCtx.request.post(`${BASE}/api/auth/login`, {
  data: { email: 'student@alqimma.com', password: 'password123' },
});
const studentListBefore = await (await studentCtx.request.get(`${BASE}/api/videos`)).json();
const visibleBefore = studentListBefore.data.videos.filter((v) => v.title.includes('تسجيل')).length;
check('student cannot see the unpublished recording', visibleBefore === beforeCount, `visible=${visibleBefore} drafts=${beforeCount}`);

// the teacher accepts it
// the context-level handler already accepts confirm() dialogs
await teacherPage.locator('button:has-text("قبول ونشر")').first().click();
await teacherPage.waitForTimeout(2500);
check('draft badge disappears after publishing', (await teacherPage.locator('text=مسودة').count()) === 0);

const studentListAfter = await (await studentCtx.request.get(`${BASE}/api/videos`)).json();
const published = studentListAfter.data.videos.filter((v) => v.title.includes('تسجيل'));
check('student sees the recording after publish', published.length === visibleBefore + 1, `visible=${published.length}`);
check('published recording has a playable url', /^(\/uploads\/video\/)/.test(published[0]?.url ?? ''), published[0]?.url);

// ...and can take it back again, which is the only way to un-send a recording
check('the teacher is offered a way to hide it again', (await teacherPage.locator('text=إخفاء').count()) > 0);
await teacherPage.locator('button:has-text("إخفاء")').first().click();
await teacherPage.waitForTimeout(2500);
check('hiding it puts the draft badge back', (await teacherPage.locator('text=مسودة').count()) > 0);

const studentHidden = await (await studentCtx.request.get(`${BASE}/api/videos`)).json();
const hiddenVisible = studentHidden.data.videos.filter((v) => v.title.includes('تسجيل')).length;
check('a hidden recording disappears for the student', hiddenVisible === beforeCount, `visible=${hiddenVisible} expected=${beforeCount}`);

await teacherPage.locator('button:has-text("قبول ونشر")').first().click();
await teacherPage.waitForTimeout(2500);
const studentBack = await (await studentCtx.request.get(`${BASE}/api/videos`)).json();
const backVisible = studentBack.data.videos.filter((v) => v.title.includes('تسجيل')).length;
check('publishing again brings it back', backVisible === beforeCount + 1, `visible=${backVisible}`);

// verify the file is a real, non-empty video
if (published[0]?.url) {
  const fileRes = await ctx.request.get(`${BASE}${published[0].url}`);
  const buf = Buffer.from(await fileRes.body());
  check('recorded file is served', fileRes.ok(), `status=${fileRes.status()}`);
  check('recorded file is a real webm/mp4', buf.length > 1000 && (buf.subarray(0, 4).toString('hex') === '1a45dfa3' || buf.subarray(4, 8).toString('ascii') === 'ftyp'), `bytes=${buf.length} magic=${buf.subarray(0, 4).toString('hex')}`);

  const live = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  check('live session is marked recorded', live?.isRecorded === true && live?.recordingUrl === published[0].url, `isRecorded=${live?.isRecorded} url=${live?.recordingUrl}`);
  check('live session ended', live?.status === 'ENDED', live?.status);

// the finished session must not linger in the teacher's live list
const teacherListRes = await ctx.request.get(`${BASE}/api/live`);
const teacherList = await teacherListRes.json();
const stillListed = (teacherList.data?.sessions ?? []).some((s) => s.id === sessionId);
check('ended session is gone from the live list API', !stillListed, `statuses=${[...new Set((teacherList.data?.sessions ?? []).map((s) => s.status))].join(',')}`);

await teacherPage.goto(`${BASE}/teacher/live`, { waitUntil: 'networkidle', timeout: 60_000 });
await teacherPage.waitForTimeout(800);
const listText = await teacherPage.locator('body').innerText();
check('ended session is not rendered on /teacher/live', !listText.includes('RECORD E2E'), listText.slice(0, 120).replace(/\n/g, ' | '));
// matched as a standalone badge, so the empty-state sentence that merely
// contains the same word is not mistaken for a rendered ENDED session
const endedBadges = await teacherPage
  .locator('span, div')
  .filter({ hasText: /^\s*منتهية\s*$/ })
  .count();
check('list shows no ended badge', endedBadges === 0, `found ${endedBadges} badge(s)`);

  await unlink(join(process.cwd(), 'public', published[0].url.replace(/^\//, ''))).catch(() => undefined);
}

// ---- cleanup: only what this run created ----
const drafts = await prisma.video.findMany({
  where: { title: { contains: 'تسجيل: RECORD E2E' } },
  select: { id: true, url: true },
});
await prisma.video.deleteMany({ where: { id: { in: drafts.map((d) => d.id) } } });
for (const draft of drafts) {
  if (draft.url?.startsWith('/uploads/')) {
    await unlink(join(process.cwd(), 'public', draft.url.replace(/^\//, ''))).catch(() => undefined);
  }
}
await prisma.attendance.deleteMany({ where: { sessionId } });
await prisma.liveSession.delete({ where: { id: sessionId } }).catch(() => undefined);
await prisma.$disconnect();
await browser.close();

const real = errors.filter((e) => !/favicon|DevTools|preload/i.test(e));
check('no console/page errors', real.length === 0, real.slice(0, 3).join(' || '));

console.log('');
if (failures.length) { console.log(`FAILED ${failures.length}: ${failures.join(' | ')}`); process.exit(1); }
console.log('ALL RECORDING E2E CHECKS PASSED');
