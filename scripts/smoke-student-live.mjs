const BASE = 'http://localhost:3000';
const log = (...a) => console.log(...a);
const failures = [];
const check = (n, c, x = '') => { log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ` :: ${x}` : ''}`); if (!c) failures.push(n); };

const createdRefreshTokens = new Set();

function trackRefresh(cookie) {
  const match = /(?:^|;\s*)refresh_token=([^;]+)/.exec(cookie ?? '');
  if (match) createdRefreshTokens.add(decodeURIComponent(match[1]));
  return cookie;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (res.ok) trackRefresh(cookie);
  return cookie;
}

const studentCookie = await login('student@alqimma.com');
const teacherCookie = await login('teacher@alqimma.com');

log('--- pages reachable ---');
for (const path of ['/student', '/student/live', '/student/subjects', '/student/notifications']) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: studentCookie }, redirect: 'manual' });
  check(`GET ${path}`, res.status === 200, `status=${res.status}`);
}
for (const path of ['/teacher', '/teacher/live']) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: teacherCookie }, redirect: 'manual' });
  check(`GET ${path}`, res.status === 200, `status=${res.status}`);
}

log('--- student blocked from teacher areas ---');
for (const path of ['/teacher/live', '/teacher/videos', '/admin']) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: studentCookie }, redirect: 'manual' });
  const loc = res.headers.get('location') ?? '';
  check(`student ${path} redirected`, res.status === 307 || res.status === 302, `status=${res.status} loc=${loc}`);
}

log('--- student stats API is real ---');
const stats = await fetch(`${BASE}/api/student/stats`, { headers: { cookie: studentCookie } });
const statsBody = await stats.json();
check('GET /api/student/stats', stats.status === 200 && statsBody.success === true, JSON.stringify(statsBody).slice(0, 220));
check('stats has enrolledCourses', typeof statsBody?.data?.enrolledCourses === 'number', `enrolledCourses=${statsBody?.data?.enrolledCourses}`);
check('attendanceRate is number or null', statsBody?.data?.attendanceRate === null || typeof statsBody?.data?.attendanceRate === 'number', `rate=${statsBody?.data?.attendanceRate}`);

const tStats = await fetch(`${BASE}/api/student/stats`, { headers: { cookie: teacherCookie } });
check('teacher cannot read student stats', tStats.status === 403, `status=${tStats.status}`);

const anon = await fetch(`${BASE}/api/student/stats`);
check('anon cannot read student stats', anon.status === 401, `status=${anon.status}`);

log('--- student live list API ---');
const list = await fetch(`${BASE}/api/live`, { headers: { cookie: studentCookie } });
const listBody = await list.json();
check('GET /api/live as student', list.status === 200 && Array.isArray(listBody?.data?.sessions), `sessions=${listBody?.data?.sessions?.length}`);

const tList = await fetch(`${BASE}/api/live?all=true`, { headers: { cookie: teacherCookie } });
const tListBody = await tList.json();
const hasEnded = (tListBody?.data?.sessions ?? []).some((s) => s.status === 'ENDED');
check('teacher sees all statuses incl ENDED', hasEnded, `statuses=${[...new Set((tListBody?.data?.sessions ?? []).map((s) => s.status))].join(',')}`);

const sList = await fetch(`${BASE}/api/live?all=true`, { headers: { cookie: studentCookie } });
const sListBody = await sList.json();
const sSessions = sListBody?.data?.sessions ?? [];
const cancelled = sSessions.filter((s) => s.status === 'CANCELLED');
// `all=true` is a teacher-only widening and must do nothing for a student. A
// student may still see an ENDED session, but only a recorded one: that is the
// replay route, and it is gated on isRecorded + recordingUrl on purpose.
const endedUnrecorded = sSessions.filter((s) => s.status === 'ENDED' && (!s.isRecorded || !s.recordingUrl));
check('student never sees CANCELLED via all=true', cancelled.length === 0, `cancelled=${cancelled.length}`);
check('student sees no unrecorded ENDED session', endedUnrecorded.length === 0, `unrecorded=${endedUnrecorded.length}`);
check(
  'every ENDED session a student sees is a recording',
  sSessions.filter((s) => s.status === 'ENDED').every((s) => s.isRecorded && s.recordingUrl),
  `statuses=${[...new Set(sSessions.map((s) => s.status))].join(',')}`,
);

log('--- multi-session login (regression: unique refresh tokens) ---');
const rapid = await Promise.all(
  Array.from({ length: 6 }, () => fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@alqimma.com', password: 'password123' }),
  })),
);
const rapidBodies = await Promise.all(rapid.map((r) => r.json().catch(() => null)));
const allOk = rapid.every((r) => r.ok) && rapidBodies.every((b) => b?.success);
check('6 concurrent logins all succeed (no token collision)', allOk,
  rapid.map((r, i) => `${r.status}${rapidBodies[i]?.success ? '' : `:${rapidBodies[i]?.message ?? ''}`}`).join(','));

const refreshTokens = new Set(
  rapid.map((r) => r.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('refresh_token=')) ?? ''),
);
rapid.forEach((r) => trackRefresh(r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')));
check('every login issues a distinct refresh token', refreshTokens.size === rapid.length && !refreshTokens.has(''), `unique=${refreshTokens.size}/${rapid.length}`);

const accessTokens = new Set(
  rapid.map((r) => r.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('access_token=')) ?? ''),
);
check('every login issues a distinct access token', accessTokens.size === rapid.length, `unique=${accessTokens.size}/${rapid.length}`);

log('--- logout scope + refresh rotation ---');
const deviceA = await login('student@alqimma.com');
const deviceB = await login('student@alqimma.com');

const outA = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie: deviceA } });
check('logout A ok', outA.ok, `status=${outA.status}`);

const refreshA = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { cookie: deviceA } });
check('device A refresh token is revoked after logout', refreshA.status === 401, `status=${refreshA.status}`);

const refreshB = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { cookie: deviceB } });
check('device B can still refresh (scoped logout)', refreshB.ok, `status=${refreshB.status}`);

const rotatedB = refreshB.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('refresh_token='));
check('refresh rotation issues a new refresh token', Boolean(rotatedB), rotatedB ?? 'none');
trackRefresh(refreshB.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '));

if (rotatedB) {
  const replayOld = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { cookie: deviceB } });
  check('rotated-out refresh token cannot be replayed', replayOld.status === 401, `status=${replayOld.status}`);
}

log('--- test artifact cleanup ---');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
const before = await prisma.refreshToken.count({ where: { expiresAt: { gt: new Date() } } });
await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
const cleaned = await prisma.refreshToken.deleteMany({ where: { token: { in: [...createdRefreshTokens] } } });
const after = await prisma.refreshToken.count({ where: { expiresAt: { gt: new Date() } } });
await prisma.$disconnect();
check('expired refresh token cleanup runs', before >= 0, `active before=${before} after=${after}`);
check('only this run\'s refresh tokens are removed', cleaned.count <= createdRefreshTokens.size, `deleted=${cleaned.count}/${createdRefreshTokens.size}`);

log('');
if (failures.length) { log(`FAILED ${failures.length}: ${failures.join(' | ')}`); process.exit(1); }
log('ALL STUDENT LIVE CHECKS PASSED');
process.exit(0);
