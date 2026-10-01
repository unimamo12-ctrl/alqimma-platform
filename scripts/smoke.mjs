import { unlink } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

async function removeUploadFile(url) {
  if (!url || !url.startsWith('/uploads/')) return false;
  try {
    await unlink(path.join(UPLOAD_DIR, url.slice('/uploads/'.length)));
    return true;
  } catch {
    return false;
  }
}

const ACCOUNTS = {
  admin: 'admin@alqimma.com',
  teacher: 'teacher@alqimma.com',
  student: 'student@alqimma.com',
};

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
  return { status: res.status, cookie };
}

async function check(cookie, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const loc = res.headers.get('location');
  return `${res.status}${loc ? ` -> ${loc.replace(BASE, '')}` : ''}`;
}

async function api(cookie, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

const PAGES = [
  '/', '/login', '/register', '/forgot-password', '/reset-password', '/teachers',
  '/dashboard', '/student', '/student/notifications', '/student/subscriptions',
  '/teacher', '/teacher/videos', '/teacher/videos/video-1', '/teacher/files',
  '/teacher/exercises', '/teacher/live', '/teacher/live/live-algebra-review',
  '/teacher/attendance', '/teacher/students', '/teacher/profile',
  '/teacher/settings',
  '/admin', '/admin/students', '/admin/teachers', '/admin/content',
  '/admin/subscriptions',
];

const APIS = [
  '/api/teachers', '/api/subjects', '/api/levels', '/api/videos', '/api/files',
  '/api/exercises', '/api/courses', '/api/live', '/api/notifications',
  '/api/attendance', '/api/subscriptions', '/api/admin/stats',
  '/api/admin/students', '/api/admin/teachers', '/api/teacher/students',
  '/api/teacher/stats', '/api/payments',
  '/api/videos/video-1', '/api/files/file-exercises-3am',
  '/api/exercises/exercise-algebra-1',
];

async function main() {
  const sessions = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    sessions[role] = (await login(email)).cookie;
  }

  console.log('=== PAGES (anonymous) ===');
  for (const p of PAGES) console.log(`  ${p.padEnd(28)} ${await check('', p)}`);

  for (const role of ['student', 'teacher', 'admin']) {
    console.log(`=== PAGES (${role}) ===`);
    for (const p of PAGES) console.log(`  ${p.padEnd(28)} ${await check(sessions[role], p)}`);
  }

  console.log('=== APIS (anonymous) ===');
  for (const p of APIS) console.log(`  ${p.padEnd(28)} ${(await api('', p)).status}`);

  for (const role of ['student', 'teacher', 'admin']) {
    console.log(`=== APIS (${role}) ===`);
    for (const p of APIS) console.log(`  ${p.padEnd(28)} ${(await api(sessions[role], p)).status}`);
  }

  console.log('=== SEEDED DATA (student) ===');
  const courses = await api(sessions.student, '/api/courses');
  console.log('  courses returned      ', courses.status, '| count =', courses.body?.data?.courses?.length ?? 'n/a');
  const subs = await api(sessions.student, '/api/subscriptions');
  console.log('  student plans         ', subs.body?.data?.plans?.length ?? 0, '| subs =', subs.body?.data?.subscriptions?.length ?? 0);
  const notifs = await api(sessions.student, '/api/notifications');
  console.log('  student notifications ', notifs.body?.data?.notifications?.length ?? 0, '| unread =', notifs.body?.data?.unreadCount ?? 'n/a');
  const tStudents = await api(sessions.teacher, '/api/teacher/students');
  console.log('  teacher enrolled      ', tStudents.body?.data?.students?.length ?? 'n/a');
  const tStats = await api(sessions.teacher, '/api/teacher/stats');
  console.log('  teacher stats         ', JSON.stringify(tStats.body?.data?.stats ?? {}));
  const aSubs = await api(sessions.admin, '/api/subscriptions');
  console.log('  admin plans+subs      ', aSubs.body?.data?.plans?.length ?? 0, '/', aSubs.body?.data?.subscriptions?.length ?? 0);

  console.log('=== CONTENT OWNERSHIP ===');
  const questionKeys = async (cookie) => {
    const res = await api(cookie, '/api/exercises');
    const questions = res.body?.data?.exercises?.[0]?.questions ?? [];
    return Object.keys(questions[0] ?? {}).sort().join(',');
  };
  const anonKeys = await questionKeys('');
  const studentKeys = await questionKeys(sessions.student);
  const teacherKeys = await questionKeys(sessions.teacher);
  console.log('  anon exercise question keys    ', anonKeys, anonKeys.includes('correctAnswer') ? '(LEAK!)' : '(no answer)');
  console.log('  student exercise question keys ', studentKeys, studentKeys.includes('correctAnswer') ? '(LEAK!)' : '(no answer)');
  console.log('  teacher(owner) question keys   ', teacherKeys, teacherKeys.includes('correctAnswer') ? '(has answer)' : '(MISSING answer)');
  const ownVideos = await api(sessions.teacher, '/api/videos');
  const ownFiles = await api(sessions.teacher, '/api/files');
  const foreignVideos = await api(sessions.teacher, '/api/videos?teacherId=someone-else');
  const foreignFiles = await api(sessions.teacher, '/api/files?teacherId=someone-else');
  const ownVideoCount = ownVideos.body?.data?.videos?.length ?? -1;
  const ownFileCount = ownFiles.body?.data?.files?.length ?? -1;
  const foreignVideoCount = foreignVideos.body?.data?.videos?.length ?? -1;
  const foreignFileCount = foreignFiles.body?.data?.files?.length ?? -1;
  console.log('  teacher videos own/foreign param', ownVideoCount, '/', foreignVideoCount, foreignVideoCount === ownVideoCount ? '(param ignored, no leak)' : '(LEAK!)');
  console.log('  teacher files  own/foreign param', ownFileCount, '/', foreignFileCount, foreignFileCount === ownFileCount ? '(param ignored, no leak)' : '(LEAK!)');
  const adminCourses = await api(sessions.admin, '/api/courses');
  const teacherCourses = await api(sessions.teacher, '/api/courses');
  const studentCourses = await api(sessions.student, '/api/courses');
  console.log('  courses admin/teacher/student  ',
    adminCourses.body?.data?.courses?.length ?? 'n/a', '/',
    teacherCourses.body?.data?.courses?.length ?? 'n/a', '/',
    studentCourses.body?.data?.courses?.length ?? 'n/a');
  console.log('  admin POST /api/courses no owner', (await api(sessions.admin, '/api/courses', { method: 'POST', body: JSON.stringify({ subjectId: 'x', levelId: 'y', title: 'z' }) })).status, '(expect 400)');
  console.log('  teacher POST /api/courses bad type', (await api(sessions.teacher, '/api/courses', { method: 'POST', body: JSON.stringify({ subjectId: 'x', levelId: 'y', title: 'z', type: 'NOPE' }) })).status, '(expect 400)');

  console.log('=== MEDIA UPLOAD ===');
  const blobOf = (bytes, type) => new Blob([new Uint8Array(bytes)], { type });
  const sendUpload = async (cookie, kind, name, type, bytes = 4096) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', blobOf(bytes, type), name);
    const res = await fetch(`${BASE}/api/uploads`, { method: 'POST', headers: cookie ? { cookie } : {}, body: form });
    let body = {};
    try { body = await res.json(); } catch { body = {}; }
    return { status: res.status, body };
  };
  const vidUp = await sendUpload(sessions.teacher, 'video', 'smoke.mp4', 'video/mp4');
  const vidUrl = vidUp.body?.data?.upload?.url;
  console.log('  teacher upload video          ', vidUp.status, vidUrl ?? '', '(expect 200)');
  console.log('  served uploaded file          ', (await fetch(`${BASE}${vidUrl}`)).status, '(expect 200)');
  console.log('  reject bad mime               ', (await sendUpload(sessions.teacher, 'document', 'smoke.exe', 'application/x-msdownload')).status, '(expect 400)');
  console.log('  reject video as document      ', (await sendUpload(sessions.teacher, 'document', 'smoke.mp4', 'video/mp4')).status, '(expect 400)');
  console.log('  reject empty file             ', (await sendUpload(sessions.teacher, 'video', 'empty.mp4', 'video/mp4', 0)).status, '(expect 400)');
  console.log('  anon upload                   ', (await sendUpload('', 'video', 'a.mp4', 'video/mp4')).status, '(expect 401)');
  console.log('  student upload                ', (await sendUpload(sessions.student, 'video', 'a.mp4', 'video/mp4')).status, '(expect 403)');
  const docUp = await sendUpload(sessions.teacher, 'document', 'smoke.pdf', 'application/pdf');
  console.log('  teacher upload document       ', docUp.status, '(expect 200)');
  const courseForUpload = (await api(sessions.teacher, '/api/courses')).body?.data?.courses?.[0]?.id;
  const uploadVideo = await api(sessions.teacher, '/api/videos', {
    method: 'POST',
    body: JSON.stringify({ courseId: courseForUpload, title: 'SMOKE UPLOAD', url: vidUrl, duration: 60 }),
  });
  const uploadVideoId = uploadVideo.body?.data?.video?.id;
  console.log('  create video from upload      ', uploadVideo.status, '(expect 200)');
  console.log('  response has course.title     ', Boolean(uploadVideo.body?.data?.video?.course?.title), '(expect true)');
  const uploadExercise = await api(sessions.teacher, '/api/exercises', {
    method: 'POST',
    body: JSON.stringify({ courseId: courseForUpload, title: 'SMOKE EX', questions: [{ text: 'q', options: ['a', 'b'], correctAnswer: 0 }] }),
  });
  console.log('  create exercise has course    ', Boolean(uploadExercise.body?.data?.exercise?.course?.title), '(expect true)');
  const uploadFileRec = await api(sessions.teacher, '/api/files', {
    method: 'POST',
    body: JSON.stringify({ courseId: courseForUpload, name: 'SMOKE FILE', url: '/uploads/file/x.pdf', fileType: 'PDF' }),
  });
  console.log('  create file has course        ', Boolean(uploadFileRec.body?.data?.file?.course?.title), '(expect true)');
  await api(sessions.teacher, `/api/exercises/${uploadExercise.body?.data?.exercise?.id}`, { method: 'DELETE' });
  await api(sessions.teacher, `/api/files/${uploadFileRec.body?.data?.file?.id}`, { method: 'DELETE' });
  console.log('  delete video (removes file)   ', (await api(sessions.teacher, `/api/videos/${uploadVideoId}`, { method: 'DELETE' })).status, '(expect 200)');
  console.log('  file removed from disk        ', (await fetch(`${BASE}${vidUrl}`)).status, '(expect 404)');
  const orphanDoc = docUp.body?.data?.upload?.url;
  console.log('  orphan document cleanup       ', (await removeUploadFile(orphanDoc)) ? 'removed' : 'not found', orphanDoc ?? '');

  console.log('=== LIVE BROADCAST FLOW ===');
  const broadcastCourses = (await api(sessions.teacher, '/api/courses')).body?.data?.courses ?? [];
  const courseId = broadcastCourses[0]?.id;
  const livePatch = (cookie, id, status) => api(cookie, `/api/live/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  console.log('  POST /api/live missing course ', (await api(sessions.teacher, '/api/live', { method: 'POST', body: JSON.stringify({ title: 'x' }) })).status, '(expect 400)');
  console.log('  POST /api/live no schedule    ', (await api(sessions.teacher, '/api/live', { method: 'POST', body: JSON.stringify({ courseId, title: 'x' }) })).status, '(expect 400)');
  const started = await api(sessions.teacher, '/api/live', { method: 'POST', body: JSON.stringify({ courseId, title: 'SMOKE BROADCAST', startNow: true }) });
  const liveId = started.body?.data?.session?.id;
  console.log('  POST /api/live startNow       ', started.status, '| status =', started.body?.data?.session?.status, '(expect 200/LIVE)');
  console.log('  GET  /api/live/[id] teacher   ', (await api(sessions.teacher, `/api/live/${liveId}`)).status, '(expect 200)');
  const studentSees = (await api(sessions.student, '/api/live')).body?.data?.sessions?.some((s) => s.id === liveId);
  console.log('  student sees LIVE session     ', studentSees, '(expect true)');
  console.log('  PATCH LIVE->SCHEDULED         ', (await livePatch(sessions.teacher, liveId, 'SCHEDULED')).status, '(expect 409)');
  console.log('  PATCH bad status              ', (await livePatch(sessions.teacher, liveId, 'HACKED')).status, '(expect 400)');
  console.log('  student PATCH live            ', (await livePatch(sessions.student, liveId, 'LIVE')).status, '(expect 403)');
  console.log('  PATCH ->ENDED                 ', (await livePatch(sessions.teacher, liveId, 'ENDED')).status, '(expect 200)');
  console.log('  PATCH ENDED->LIVE             ', (await livePatch(sessions.teacher, liveId, 'LIVE')).status, '(expect 409)');
  await api(sessions.admin, `/api/live/${liveId}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) });

  console.log('=== ROLE ISOLATION ===');
  console.log('  student -> /api/teacher/stats  ', (await api(sessions.student, '/api/teacher/stats')).status, '(expect 403)');
  console.log('  student -> /api/admin/stats    ', (await api(sessions.student, '/api/admin/stats')).status, '(expect 401/403)');
  console.log('  teacher -> /api/admin/students ', (await api(sessions.teacher, '/api/admin/students')).status, '(expect 401/403)');
  console.log('  anon    -> /api/teacher/stats  ', (await api('', '/api/teacher/stats')).status, '(expect 401)');
  console.log('  admin POST /api/teacher/stats  ', (await api(sessions.admin, '/api/teacher/stats', { method: 'POST', body: '{}' })).status, '(expect 405)');

  console.log('=== WRITE ATTEMPTS ===');
  const write = (p, body, method = 'POST') => api(sessions.student, p, { method, body: JSON.stringify(body) });
  console.log('  student POST /api/videos      ', (await write('/api/videos', { courseId: 'x', title: 't', url: 'u' })).status, '(expect 401/403)');
  console.log('  student POST /api/exercises   ', (await write('/api/exercises', { courseId: 'x', title: 't' })).status, '(expect 401/403)');
  console.log('  student POST /api/notifications', (await write('/api/notifications', { title: 'a', message: 'b', type: 'INFO' })).status, '(expect 403)');
  console.log('  student POST /api/subscriptions', (await write('/api/subscriptions', { planId: 'nope', paymentMethod: 'CASH' })).status, '(expect 400/404)');
  console.log('  student POST /api/admin/plans ', (await write('/api/admin/plans', { name: 'x', price: 1, duration: 30 })).status, '(expect 403)');
  console.log('  student POST /api/payments    ', (await write('/api/payments', { paymentId: 'x', status: 'COMPLETED' })).status, '(expect 401/403)');
  console.log('  student DELETE /api/videos/video-1', (await write('/api/videos/video-1', {}, 'DELETE')).status, '(expect 401/403)');
  console.log('  student PUT notif foreign id  ', (await write('/api/notifications', { notificationId: 'nope', isRead: true }, 'PUT')).status, '(expect 404)');
  console.log('  anon POST /api/auth/register bad', (await api('', '/api/auth/register', { method: 'POST', body: JSON.stringify({}) })).status, '(expect 400)');
  console.log('  anon POST login bad password  ', (await api('', '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'student@alqimma.com', password: 'wrongpassword' }) })).status, '(expect 401)');
  console.log('  anon POST login short password ', (await api('', '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'student@alqimma.com', password: 'x' }) })).status, '(expect 400)');
  console.log('  anon POST login bad email      ', (await api('', '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'not-an-email', password: 'password123' }) })).status, '(expect 400)');
  console.log('  admin POST payment bad status  ', (await api(sessions.admin, '/api/payments', { method: 'POST', body: JSON.stringify({ paymentId: 'payment-seed-1', status: 'HACKED' }) })).status, '(expect 400)');
  console.log('=== CLEANUP ===');
  if (liveId) {
    const res = await api(sessions.admin, `/api/live/${liveId}`, { method: 'DELETE' });
    console.log('  remove smoke broadcast        ', res.status, res.status === 404 ? '(no DELETE route yet)' : '');
  }
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const deleted = await prisma.refreshToken.deleteMany({ where: { token: { in: [...createdRefreshTokens] } } });
  await prisma.$disconnect();
  console.log('  remove test refresh tokens    ', deleted.count, 'of', createdRefreshTokens.size, '(this run only)');
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
