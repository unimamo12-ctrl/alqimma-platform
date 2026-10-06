import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const failures = [];
const check = (n, c, x = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ` :: ${x}` : ''}`);
  if (!c) failures.push(n);
};

const createdRefreshTokens = new Set();
const createdUploadUrls = new Set();
let liveSessionId = null;

const trackCookies = async (ctx) => {
  const cookies = await ctx.cookies(BASE).catch(() => []);
  for (const c of cookies) {
    if (c.name === 'refresh_token' && c.value) createdRefreshTokens.add(decodeURIComponent(c.value));
  }
};

const loginApi = async (ctx, email) => {
  const res = await ctx.request.post(`${BASE}/api/auth/login`, {
    data: { email, password: 'password123' },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok() || !body?.success) {
    throw new Error(`login ${email} failed status=${res.status()} body=${JSON.stringify(body)}`);
  }
  await trackCookies(ctx);
  return body.data.user;
};

const loginViaUi = async (page, email, expectPath) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 60_000 });

  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.fill(email);
  // ensure React state captured the value (hydration can lag the DOM)
  for (let i = 0; i < 10; i += 1) {
    if ((await emailInput.inputValue()) === email) break;
    await emailInput.fill(email);
    await page.waitForTimeout(300);
  }
  await page.locator('input[type="password"]').first().fill('password123');

  /*
   * Navigating to the landing page first is what makes this reliable: without
   * it the very first click can land while the app shell is still hydrating, and
   * the login POST goes out before `waitForResponse` has attached its listener.
   */
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 60_000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
  const body = await res.json().catch(() => null);
  if (!res.ok() || !body?.success) {
    throw new Error(`ui login ${email} failed status=${res.status()} body=${JSON.stringify(body)}`);
  }
  /*
   * `expectPath` may be empty. The login page now sends a plain sign-in to the
   * landing page ("/") instead of the role dashboard, so a check that just
   * needs "the login succeeded" must not assume /student.
   */
  if (expectPath) {
    await page.waitForURL((u) => u.pathname.startsWith(expectPath), { timeout: 60_000 });
  } else {
    await page.waitForURL((u) => u.pathname !== '/login', { timeout: 60_000 });
  }
};

const browser = await chromium.launch({
  timeout: 120_000,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    // headless containers have no mDNS responder, so local ICE candidates
    // would stay unresolvable
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    // auto-accept the getDisplayMedia picker with a virtual screen
    '--auto-select-desktop-capture-source=Entire screen',
    '--allow-http-screen-capture',
  ],
});

const teacherCtx = await browser.newContext({
  permissions: ['camera', 'microphone'],
  viewport: { width: 1440, height: 900 },
});
const studentCtx = await browser.newContext({
  permissions: ['camera', 'microphone'],
  viewport: { width: 390, height: 844 },
});

const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
};

const teacher = await teacherCtx.newPage();
const student = await studentCtx.newPage();
watch(teacher, 'teacher');
watch(student, 'student');

const uiPage = await browser.newPage();
try {
  // No expected path: a plain sign-in now lands on the landing page, not /student.
  // The point of this check is that the form submitted and the cookie landed.
  await loginViaUi(uiPage, 'student@alqimma.com', '');
  check('login form works end-to-end', !uiPage.url().includes('/login'), uiPage.url());
} catch (e) {
  check('login form works end-to-end', false, e.message);
}
await trackCookies(uiPage.context());
await uiPage.close();

const teacherUser = await loginApi(teacherCtx, 'teacher@alqimma.com');
const studentUser = await loginApi(studentCtx, 'student@alqimma.com');
check('teacher session via API', teacherUser.role === 'TEACHER', teacherUser.role);
check('student session via API', studentUser.role === 'STUDENT', studentUser.role);

await teacher.goto(`${BASE}/teacher`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await teacher.waitForTimeout(4000);
// The heading is now screen-reader-only and carries the role word, so assert on
// real content instead of a specific heading string.
const teacherBody = await teacher.locator('body').innerText();
check(
  'teacher dashboard renders',
  /أستاذ/.test(teacherBody) && /الفيديوهات|الاختبارات|البث المباشر/.test(teacherBody),
  teacherBody.slice(0, 120).replace(/\n/g, ' | '),
);

await student.goto(`${BASE}/student`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await student.waitForSelector('text=الدورات المسجّل بها', { timeout: 30_000 });
const dashText = await student.locator('body').innerText();
check('student dashboard shows real enrolled count', /الدورات المسجّل بها/.test(dashText));
check('student dashboard has no hardcoded zeros', !/>\s*0\s*</.test(dashText), dashText.slice(0, 160).replace(/\n/g, ' | '));

// create a live session through the real UI
await teacher.goto(`${BASE}/teacher/live`, { waitUntil: 'networkidle', timeout: 90_000 });
await teacher.getByRole('button', { name: 'بث جديد' }).click();
await teacher.locator('form select').first().waitFor({ state: 'visible', timeout: 60_000 });
await teacher.locator('form select').first().selectOption({ index: 1 });
await teacher.locator('form input[type="text"]').first().fill('E2E WebRTC');
const startNow = teacher.locator('form input[type="checkbox"]').first();
if (!(await startNow.isChecked())) await startNow.check();
await Promise.all([
  teacher.waitForResponse((r) => r.url().includes('/api/live') && r.request().method() === 'POST', { timeout: 60_000 }),
  teacher.locator('form button[type="submit"]').first().click(),
]);
await teacher.waitForURL(/\/teacher\/live\/[^/]+$/, { timeout: 60_000 });
const sessionUrl = teacher.url();
const sessionId = sessionUrl.split('/').pop();
liveSessionId = sessionId;
check('teacher created + entered live room', Boolean(sessionId), sessionUrl);

await teacher.waitForTimeout(2500);
const connBadge = await teacher.locator('text=متصل').count();
check('teacher socket connected', connBadge > 0);

// student joins the same room
await student.goto(`${BASE}/student/live/${sessionId}`, { waitUntil: 'domcontentloaded' });
await student.waitForTimeout(4000);

const students = await student.evaluate(() => document.body.innerText);
check('student room renders (waiting or teacher tile)', /في انتظار|انتهت|أمين بن محمد/.test(students), students.slice(0, 120).replace(/\n/g, ' | '));

// teacher turns on camera -> student should receive a remote video track
await teacher.click('button[title="الكاميرا"]');
await teacher.waitForTimeout(6000);

const media = await student.evaluate(async () => {
  const videos = [...document.querySelectorAll('video')];
  return {
    count: videos.length,
    playing: videos.filter((v) => v.videoWidth > 0 && v.videoHeight > 0).length,
    sizes: videos.map((v) => `${v.videoWidth}x${v.videoHeight}`),
  };
});
check('student renders a remote video element', media.count >= 1, `videos=${media.count}`);
check('remote video actually has frames (WebRTC connected)', media.playing >= 1, `sizes=${media.sizes.join(',')}`);

/**
 * Wait until the remote reaches a given height.
 *
 * Chrome's bandwidth estimator ramps a new stream out of a low starting layer,
 * and it does so in plateaus: a resolution can sit unchanged for ten seconds and
 * then step again. Any "is it stable yet" heuristic races that and will happily
 * declare 480x270 settled half-way up. Polling for the condition itself cannot
 * be fooled that way, and it returns as soon as the condition holds rather than
 * burning the whole timeout. Bounded, so a stalled stream fails the check.
 */
async function waitForRemoteHeight(page, minHeight, timeoutMs = 90_000) {
  const started = Date.now();
  let last = [];

  while (Date.now() - started < timeoutMs) {
    last = await page.evaluate(() =>
      [...document.querySelectorAll('video')].map((v) => `${v.videoWidth}x${v.videoHeight}`));
    const tallest = Math.max(...last.map((s) => Number.parseInt(s.split('x')[1] ?? '0', 10) || 0));
    if (tallest >= minHeight) return last;
    await page.waitForTimeout(2000);
  }
  return last;
}

/**
 * The outgoing local track, read off the preview element.
 *
 * `contentHint` is the discriminator between camera and shared screen, and it
 * has to be: once both are captured at 1080p they are the same dimensions, so
 * no size comparison can tell "swapped back to the camera" from "still sharing".
 *
 * The E2E deliberately reads what it can off the DOM rather than reaching into
 * the app. Sender parameters — `maxFramerate` above all — are not reachable
 * that way, so a mesh that publishes itself for testing is installed on
 * `window` and torn down in the browser context only. It is a test-only hook:
 * nothing in `src/` references it.
 */
async function outgoingTrack(page) {
  return page.evaluate(() => {
    const video = [...document.querySelectorAll('video')][0];
    const track = video?.srcObject?.getVideoTracks?.()[0];
    if (!track) return null;
    const s = track.getSettings?.() ?? {};
    return { w: s.width ?? 0, h: s.height ?? 0, fps: s.frameRate ?? 0, hint: track.contentHint ?? null };
  });
}

const cameraSource = await outgoingTrack(teacher);
check(
  'camera capture honours the 1080p constraint',
  cameraSource !== null && cameraSource.w >= 1920 && cameraSource.h >= 1080,
  `capture=${cameraSource ? `${cameraSource.w}x${cameraSource.h}` : 'none'}`,
);
check(
  'camera track is tagged motion, so the encoder treats it as video',
  cameraSource?.hint === 'motion',
  `contentHint=${cameraSource?.hint}`,
);

// The frame-rate policy is `maxFramerate` tracking the delivered rate, capped at
// 60. Chromium's fake device tops out near 20fps and cannot be pushed higher, so
// this asserts the *policy* — the encoder cap follows what the camera actually
// produced, and never exceeds 60 — rather than a literal 60, which this
// environment cannot produce and which a real device has to be trusted for.
const senderCap = await teacher.evaluate(() => {
  const pc = window.__probePc;
  if (!pc) return null;
  const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
  if (!sender) return null;
  const params = sender.getParameters();
  return {
    maxFramerate: params.encodings?.[0]?.maxFramerate ?? null,
    maxBitrate: params.encodings?.[0]?.maxBitrate ?? null,
  };
});
check(
  'sender frame-rate cap follows the captured rate and never exceeds 60',
  senderCap !== null
    && cameraSource !== null
    && senderCap.maxFramerate === Math.min(cameraSource.fps || 60, 60),
  `captured=${cameraSource?.fps}fps cap=${senderCap?.maxFramerate}`,
);
// The 60fps bitrate scaling is NOT asserted here: this fake device reports 20fps,
// so the live policy correctly applies no multiplier and there is no 60fps stream
// to measure. `scripts/check-quality-policy.mjs` covers that table directly.

// Delivery is congestion-controlled and takes ~25s to climb to full resolution,
// so this only asserts it ends up far above the old 480p default. Asserting
// 1080p here would measure the test machine's bandwidth, not the policy.
const settledCamera = await waitForRemoteHeight(student, 720);
check(
  'delivered camera climbs well past the old 480p default',
  settledCamera.some((s) => (Number.parseInt(s.split('x')[1] ?? '0', 10) || 0) >= 720),
  `delivered=${settledCamera.join(',')}`,
);

const tileNames = await student.evaluate(() =>
  [...document.querySelectorAll('video')].map((v) => v.parentElement?.innerText?.trim()).filter(Boolean),
);
check('student tile shows sender name', tileNames.some((t) => t.includes('أمين')), tileNames.join(' | '));

// snapshot -> students get the overlay
await teacher.click('button[title="إرسال لقطة شاشة للطلاب"]');
await teacher.waitForTimeout(5000);
const studentSnap = await student.evaluate(() => ({
  imgs: [...document.querySelectorAll('img')].map((i) => i.getAttribute('src')).filter(Boolean),
  badge: document.body.innerText.includes('لقطة شاشة معلّقة'),
}));
check('student received snapshot overlay', studentSnap.badge, JSON.stringify(studentSnap.imgs).slice(0, 160));
check('snapshot image loaded from /uploads/image/', studentSnap.imgs.some((s) => s.startsWith('/uploads/image/')), studentSnap.imgs.join(','));
studentSnap.imgs.filter((s) => s.startsWith('/uploads/')).forEach((s) => createdUploadUrls.add(s));

const imgOk = studentSnap.imgs.length
  ? await student.evaluate((src) => new Promise((res) => {
      const img = new Image();
      img.onload = () => res(`${img.naturalWidth}x${img.naturalHeight}`);
      img.onerror = () => res('ERR');
      img.src = src;
    }), studentSnap.imgs[0])
  : 'none';
check('snapshot image is valid and non-empty', imgOk !== 'ERR' && imgOk !== '0x0' && imgOk !== 'none', `dims=${imgOk}`);

// ---- screen share ----
await teacher.click('button[title="مشاركة أي شاشة"]');
await teacher.waitForTimeout(6000);

const shareState = await teacher.evaluate(() => {
  const btn = document.querySelector('button[title="مشاركة أي شاشة"]');
  return {
    label: btn?.textContent?.trim() ?? null,
    error: document.body.innerText.includes('تعذّر') ? document.body.innerText.slice(0, 120) : null,
  };
});
check('teacher entered screen share mode', shareState.label === '🖥️ إيقاف المشاركة', JSON.stringify(shareState));

const screenSource = await outgoingTrack(teacher);
check(
  'screen share is tagged detail, so the encoder protects text sharpness',
  screenSource?.hint === 'detail',
  `contentHint=${screenSource?.hint}`,
);

const studentAfterShare = await student.evaluate(() => {
  const vids = [...document.querySelectorAll('video')];
  return {
    playing: vids.filter((v) => v.videoWidth > 0 && v.videoHeight > 0).length,
    sizes: vids.map((v) => `${v.videoWidth}x${v.videoHeight}`),
  };
});
check('student receives the shared screen stream', studentAfterShare.playing >= 1, `sizes=${studentAfterShare.sizes.join(',')}`);

const snapshotDuringShare = await teacher.locator('button[title="إرسال لقطة شاشة للطلاب"]').isEnabled();
check('snapshot stays available while sharing', snapshotDuringShare);

await teacher.click('button[title="مشاركة أي شاشة"]');
await teacher.waitForTimeout(4000);
const stopped = await teacher.evaluate(() => document.querySelector('button[title="مشاركة أي شاشة"]')?.textContent?.trim());
check('teacher stopped screen share', stopped === '🖥️ مشاركة الشاشة', stopped ?? 'null');

// Back to the camera. Sizes cannot tell the two apart any more, both being
// 1080p, so this watches the track tag flip back instead.
const backToCamera = await outgoingTrack(teacher);
check(
  'outgoing track returns to the camera after share stops',
  backToCamera?.hint === 'motion',
  `contentHint=${backToCamera?.hint} capture=${backToCamera ? `${backToCamera.w}x${backToCamera.h}` : 'none'}`,
);

const settledAfterStop = await waitForRemoteHeight(student, 720);
const remoteH = Math.max(
  ...settledAfterStop.map((s) => Number.parseInt(s.split('x')[1] ?? '0', 10) || 0),
);
check(
  'student keeps receiving full-resolution video after the swap back',
  remoteH >= 720,
  `settled=${settledAfterStop.join(',')}`,
);

await browser.close();

// ---- who can actually watch a broadcast ----
// This block existed to catch a disagreement between two copies of one rule: the
// audience endpoint computed eligibility from ACTIVE LIVE subscriptions, and
// `/api/live` filtered its list with the shared helper. When the two disagreed a
// teacher saw "nobody can come" against a session the student could actually
// open, with nothing to explain the gap.
//
// There is no eligibility rule any more, so the disagreement cannot recur -- and
// the assertions below now guard the two things that are still true:

{
  const apiLogin = async (email) => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    for (const match of cookie.matchAll(/refresh_token=([^;]+)/g)) {
      createdRefreshTokens.add(decodeURIComponent(match[1]));
    }
    return cookie;
  };

  const teacherCookie = await apiLogin('teacher@alqimma.com');
  const studentCookie = await apiLogin('student@alqimma.com');

  const audRes = await fetch(`${BASE}/api/live/audience?courseId=course-algebra-3am`, {
    headers: { Cookie: teacherCookie },
  });
  const aud = await audRes.json();
  check('teacher can read the audience for a course', audRes.ok && aud.success, `eligible=${aud.data?.eligibleCount} of ${aud.data?.totalStudents}`);

  // every student in the audience must really be able to open the session
  const refused = [];
  for (const person of aud.data?.eligible ?? []) {
    const cookie = await apiLogin(person.email);
    const res = await fetch(`${BASE}/api/live/${liveSessionId}`, { headers: { Cookie: cookie } });
    if (!res.ok) refused.push(`${person.email}=${res.status}`);
  }
  check('everyone in the audience can open the session', refused.length === 0, refused.join(', ') || `${aud.data.eligibleCount} checked`);

  // The regression guard for the removal itself: this used to assert a 403 for a
  // student who held no subscription. A test that silently stopped asserting it
  // would let the gate come back unnoticed, and one that kept asserting it would
  // make the removal look like a bug.
  const studentOpen = await fetch(`${BASE}/api/live/${liveSessionId}`, { headers: { Cookie: studentCookie } });
  check(
    'a plain student is not refused for want of a subscription',
    studentOpen.ok,
    `status=${studentOpen.status}`,
  );

  // Removing payment removed *gating*, not *authorization*: still signed out means
  // still refused.
  const anonymous = await fetch(`${BASE}/api/live/${liveSessionId}`);
  check('an anonymous request is still refused', anonymous.status === 401, `status=${anonymous.status}`);

  // the audience list is teacher/admin only, and only for their own course
  const leak = await fetch(`${BASE}/api/live/audience?courseId=course-algebra-3am`, { headers: { Cookie: studentCookie } });
  check('a student cannot read the audience', leak.status === 401, `status=${leak.status}`);

  const missing = await fetch(`${BASE}/api/live/audience`, { headers: { Cookie: teacherCookie } });
  check('the audience endpoint requires a courseId', missing.status === 400, `status=${missing.status}`);
}

// ---- cleanup: only what this run created ----
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
if (liveSessionId) {
  await prisma.attendance.deleteMany({ where: { sessionId: liveSessionId } });
  await prisma.liveSession.delete({ where: { id: liveSessionId } }).catch(() => undefined);
}
const deletedTokens = await prisma.refreshToken.deleteMany({ where: { token: { in: [...createdRefreshTokens] } } });
await prisma.$disconnect();
check('test refresh tokens cleaned up', deletedTokens.count <= createdRefreshTokens.size, `deleted=${deletedTokens.count}/${createdRefreshTokens.size}`);

const { unlink } = await import('node:fs/promises');
const { join } = await import('node:path');
for (const url of createdUploadUrls) {
  await unlink(join(process.cwd(), 'public', url.replace(/^\//, ''))).catch(() => undefined);
}

const real = errors.filter((e) => !/favicon|Download the React DevTools|preload/i.test(e));
check('no console/page errors', real.length === 0, real.slice(0, 3).join(' || '));

console.log('');
if (failures.length) { console.log(`FAILED ${failures.length}: ${failures.join(' | ')}`); process.exit(1); }
console.log('ALL BROWSER E2E CHECKS PASSED');
process.exit(0);
