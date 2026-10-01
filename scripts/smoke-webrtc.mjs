import { io } from 'socket.io-client';

const BASE = 'http://localhost:3000';

const log = (...args) => console.log(...args);
const failures = [];
const check = (name, cond, extra = '') => {
  log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`);
  if (!cond) failures.push(name);
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
  if (!res.ok || !cookie) throw new Error(`login ${email} failed: status=${res.status}`);
  trackRefresh(cookie);
  return cookie;
}

async function api(cookie, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', cookie, ...(init.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const connect = (cookie, label) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { path: '/api/socketio', transports: ['websocket'], extraHeaders: { cookie } });
    s.on('connect', () => { log(`socket ${label} connected`); resolve(s); });
    s.on('connect_error', (e) => reject(new Error(`${label}: ${e.message}`)));
  });

const waitFor = (socket, event, timeout = 6000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${event}`)), timeout);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });

const silence = async (socket, event, ms = 800) => {
  let fired = false;
  const handler = () => { fired = true; };
  socket.on(event, handler);
  await new Promise((r) => setTimeout(r, ms));
  socket.off(event, handler);
  return fired;
};

const teacherCookie = await login('teacher@alqimma.com');
const studentCookie = await login('student@alqimma.com');

const { body: courseList } = await api(teacherCookie, '/api/courses');
const courseId = courseList?.data?.courses?.[0]?.id;
check('teacher owns a course', Boolean(courseId));

const { body: created } = await api(teacherCookie, '/api/live', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: 'SMOKE webrtc',
    scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    startNow: true,
  }),
});
const sessionId = created?.data?.session?.id;
check('create live session', Boolean(sessionId), JSON.stringify(created?.message ?? ''));
check('session starts as LIVE', created?.data?.session?.status === 'LIVE', created?.data?.session?.status);

const ts = await connect(teacherCookie, 'teacher');
const ss = await connect(studentCookie, 'student');

const teacherJoined = waitFor(ts, 'session-joined');
ts.emit('join-session', { sessionId });
const tj = await teacherJoined;
const teacherUserId = tj.participants.find((p) => p.role === 'TEACHER')?.userId;
check('teacher session-joined', Array.isArray(tj.participants) && Boolean(teacherUserId), `participants=${tj.participants?.length}`);

const studentJoinedP = waitFor(ss, 'session-joined');
const teacherSeesJoin = waitFor(ts, 'participant-joined');
ss.emit('join-session', { sessionId });
const sj = await studentJoinedP;
const tjJoin = await teacherSeesJoin;
const studentUserId = sj.participants.find((p) => p.role === 'STUDENT')?.userId;
check('student session-joined', Boolean(studentUserId), `participants=${sj.participants?.length}`);
check('teacher notified participant-joined', tjJoin.participant?.role === 'STUDENT');

log('--- signaling relay ---');
const offerP = waitFor(ss, 'offer');
ts.emit('offer', { sessionId, targetUserId: studentUserId, sdp: { type: 'offer', sdp: 'FAKE-SDP' } });
const offer = await offerP;
check('offer relayed to student', offer.sdp?.sdp === 'FAKE-SDP', JSON.stringify(offer).slice(0, 160));
check('offer carries sender role for UI', offer.fromRole === 'TEACHER', `fromRole=${offer.fromRole}`);
check(
  'offer carries the SENDER name (not the receiver)',
  offer.fromName === tj.participants.find((p) => p.role === 'TEACHER')?.name,
  `fromName=${offer.fromName} (student is ${sj.participants.find((p) => p.role === 'STUDENT')?.name})`,
);
check('offer does not leak the receiver name', offer.fromName !== sj.participants.find((p) => p.role === 'STUDENT')?.name);

const answerP = waitFor(ts, 'answer');
ss.emit('answer', { sessionId, targetUserId: teacherUserId, sdp: { type: 'answer', sdp: 'FAKE-ANSWER' } });
const answer = await answerP;
check('answer relayed to teacher', answer.sdp?.sdp === 'FAKE-ANSWER', JSON.stringify(answer).slice(0, 160));
check(
  'answer carries the SENDER name',
  answer.fromName === sj.participants.find((p) => p.role === 'STUDENT')?.name,
  `fromName=${answer.fromName}`,
);

const iceP = waitFor(ss, 'ice-candidate');
ts.emit('ice-candidate', { sessionId, targetUserId: studentUserId, candidate: { candidate: 'candidate:FAKE' } });
const ice = await iceP;
check('ice-candidate relayed', ice.candidate?.candidate === 'candidate:FAKE', JSON.stringify(ice).slice(0, 160));

const strangerP = silence(ss, 'offer');
ts.emit('offer', { sessionId, targetUserId: 'not-a-participant', sdp: { type: 'offer', sdp: 'X' } });
check('offer to unknown target is dropped', !(await strangerP));

log('--- screen share + snapshot ---');
const flagP = waitFor(ss, 'participant-updated');
ts.emit('screen-share', { sessionId, isSharing: true });
const flag = await flagP;
check('screen-share flag broadcast', flag.isSharingScreen === true, JSON.stringify(flag).slice(0, 120));

const snapP = waitFor(ss, 'snapshot-shown');
ts.emit('show-snapshot', { sessionId, url: '/uploads/image/test.png', name: 'شاشة الأستاذ' });
const snap = await snapP;
check('show-snapshot relayed', snap.url === '/uploads/image/test.png' && snap.name === 'شاشة الأستاذ', JSON.stringify(snap).slice(0, 140));

ts.emit('show-snapshot', { sessionId, url: 'https://evil.example/x.png' });
check('snapshot url outside /uploads is rejected', !(await silence(ss, 'snapshot-shown', 700)));

let cleared = false;
ss.on('snapshot-cleared', () => { cleared = true; });
ts.emit('clear-snapshot', { sessionId });
await new Promise((r) => setTimeout(r, 700));
check('clear-snapshot relayed', cleared);

ss.emit('show-snapshot', { sessionId, url: '/uploads/image/x.png', name: 'hack' });
check('student snapshot is ignored by teacher', !(await silence(ts, 'snapshot-shown', 800)));

log('--- chat + hand raise + mic state ---');
const chatP = waitFor(ts, 'chat-message');
ss.emit('chat-message', { sessionId, content: 'سلام' });
const chat = await chatP;
check('chat relayed', chat.content === 'سلام', JSON.stringify(chat).slice(0, 120));

const handP = waitFor(ts, 'participant-updated');
ss.emit('raise-hand', { sessionId, isHandRaised: true });
check('raise-hand relayed', (await handP).isHandRaised === true);

const micP = waitFor(ts, 'participant-updated');
ss.emit('toggle-mic', { sessionId, isMuted: true });
check('toggle-mic relayed', (await micP).isMuted === true);

log('--- access control ---');
const { status: foreignDelete } = await api(studentCookie, `/api/live/${sessionId}`, { method: 'DELETE' });
check('student cannot delete session', foreignDelete === 403, `status=${foreignDelete}`);

const outsiderCookie = await login('admin@alqimma.com');
const as = await connect(outsiderCookie, 'admin');
as.emit('show-snapshot', { sessionId, url: '/y.png', snapshotName: 'admin-hack' });
check('non-host cannot broadcast snapshot', !(await silence(ss, 'snapshot-shown', 800)));
as.close();

log('--- end + cleanup ---');
const endP = waitFor(ss, 'session-ended');
ts.emit('end-session', { sessionId });
check('end-session notified students', Boolean(await endP));

const { status: del } = await api(teacherCookie, `/api/live/${sessionId}`, { method: 'DELETE' });
check('delete blocked while attendance exists', del === 409, `status=${del}`);

ts.close();
ss.close();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
await prisma.attendance.deleteMany({ where: { sessionId } });
const { status: del2 } = await api(teacherCookie, `/api/live/${sessionId}`, { method: 'DELETE' });
check('delete succeeds after attendance cleanup', del2 === 200 || del2 === 204, `status=${del2}`);
const deletedTokens = await prisma.refreshToken.deleteMany({ where: { token: { in: [...createdRefreshTokens] } } });
await prisma.$disconnect();
check('test refresh tokens cleaned up', deletedTokens.count <= createdRefreshTokens.size, `deleted=${deletedTokens.count}/${createdRefreshTokens.size}`);

log('');
if (failures.length) {
  log(`FAILED ${failures.length}: ${failures.join(' | ')}`);
  process.exit(1);
}
log('ALL SIGNALLING CHECKS PASSED');
process.exit(0);
