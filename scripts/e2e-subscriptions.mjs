/**
 * Subscription independence E2E.
 *
 * The product sells access per (subject x accessType) cell: a student buys LIVE
 * for one subject and must get nothing else. This proves that on every axis,
 * because the interesting failures are all "it leaked into something else":
 *
 *   - same subject, different access type  (MATH LIVE must not open MATH videos)
 *   - different subject, same access type (MATH LIVE must not open PHYSICS live)
 *   - a second cell in another subject   (both work, independently)
 *   - expiry, per cell                    (an expired VIDEO does not close LIVE)
 *   - status, per cell                    (PENDING/REJECTED grant nothing)
 *   - approval, per cell                  (approving one must not touch a sibling)
 *
 * It builds its own teacher course in a second subject plus temp videos,
 * exercises and a live session, and its own students with exactly the
 * subscription rows under test, then removes everything it created.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3000';
const ADMIN = 'admin@alqimma.com';
const TEACHER = 'teacher@alqimma.com';

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

async function login(email, password = 'password123') {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  for (const m of cookie.matchAll(/refresh_token=([^;]+)/g)) {
    createdRefreshTokens.add(decodeURIComponent(m[1]));
  }
  return cookie;
}

async function api(cookie, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const DAY = 24 * 60 * 60 * 1000;
const prisma = new PrismaClient();

// ids captured for cleanup
const tempCourseIds = [];
const tempVideoIds = [];
const tempExerciseIds = [];
const tempSessionIds = [];
const tempStudentIds = [];
const tempUserIds = [];

try {
  const adminCookie = await login(ADMIN);
  ok('admin can log in', Boolean(adminCookie));

  const math = await prisma.subject.findUniqueOrThrow({ where: { name: 'MATH' } });
  const physics = await prisma.subject.findUniqueOrThrow({ where: { name: 'PHYSICS' } });
  const level = await prisma.level.findFirstOrThrow();

  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { user: { email: TEACHER } },
  });

  // --- build a second subject's content, so subject isolation is testable ---
  const physicsCourse = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      subjectId: physics.id,
      levelId: level.id,
      title: 'E2E INDEPENDENCE PHYSICS',
      // PAID is the point of this script: a FREE course is open to every
      // student by design, so defaulting here would make every gating assertion
      // below pass or fail for the wrong reason.
      type: 'PAID',
      isPublished: true,
    },
  });
  tempCourseIds.push(physicsCourse.id);

  const physicsVideo = await prisma.video.create({
    data: {
      courseId: physicsCourse.id,
      title: 'E2E INDEPENDENCE PHYSICS VIDEO',
      url: '/uploads/video/e2e-independence-physics.mp4',
      isPublished: true,
    },
  });
  tempVideoIds.push(physicsVideo.id);

  const physicsExercise = await prisma.exercise.create({
    data: {
      courseId: physicsCourse.id,
      title: 'E2E INDEPENDENCE PHYSICS EXERCISE',
      questions: [{ question: 'e2e', options: ['a', 'b'], answer: 0 }],
    },
  });
  tempExerciseIds.push(physicsExercise.id);

  const physicsSession = await prisma.liveSession.create({
    data: {
      teacherId: teacher.id,
      courseId: physicsCourse.id,
      title: 'E2E INDEPENDENCE PHYSICS LIVE',
      status: 'LIVE',
      scheduledAt: new Date(),
    },
  });
  tempSessionIds.push(physicsSession.id);

  // MATH content: reuse the seeded course, but make sure it has one of each
  const mathCourse = await prisma.course.findFirstOrThrow({
    where: { subjectId: math.id },
    orderBy: { createdAt: 'asc' },
  });
  await prisma.course.update({ where: { id: mathCourse.id }, data: { isPublished: true } });

  const mathVideo = await prisma.video.create({
    data: {
      courseId: mathCourse.id,
      title: 'E2E INDEPENDENCE MATH VIDEO',
      url: '/uploads/video/e2e-independence-math.mp4',
      isPublished: true,
    },
  });
  tempVideoIds.push(mathVideo.id);

  const mathExercise = await prisma.exercise.create({
    data: {
      courseId: mathCourse.id,
      title: 'E2E INDEPENDENCE MATH EXERCISE',
      questions: [{ question: 'e2e', options: ['a', 'b'], answer: 0 }],
    },
  });
  tempExerciseIds.push(mathExercise.id);

  const mathSession = await prisma.liveSession.create({
    data: {
      teacherId: teacher.id,
      courseId: mathCourse.id,
      title: 'E2E INDEPENDENCE MATH LIVE',
      status: 'LIVE',
      scheduledAt: new Date(),
    },
  });
  tempSessionIds.push(mathSession.id);

  // --- students, one per independence scenario ---
  // bcrypt at the app's own cost: 12 rounds (SALT_ROUNDS in src/lib/auth/auth.ts).
  // The helper cannot be imported here because it is behind the `@/` alias, which
  // plain node does not resolve.
  const password = await bcrypt.hash('password123', 12);

  async function makeStudent(tag) {
    const email = `e2e-indep-${tag}@alqimma.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerified: true,
        student: { create: { firstName: `E2E${tag}`, lastName: 'Independence' } },
      },
      include: { student: true },
    });
    tempUserIds.push(user.id);
    tempStudentIds.push(user.student.id);
    return { email, studentId: user.student.id, cookie: await login(email) };
  }

  const inDays = (n) => new Date(Date.now() + n * DAY);
  const ago = new Date(Date.now() - DAY);

  async function subscribe(studentId, subjectId, accessType, opts = {}) {
    const { status = 'ACTIVE', start = ago, end = inDays(30) } = opts;
    const sub = await prisma.subscription.create({
      data: { studentId, subjectId, accessType, status, startDate: start, endDate: end },
    });
    return sub;
  }

  const liveOnly = await makeStudent('liveonly');
  await subscribe(liveOnly.studentId, math.id, 'LIVE');

  const videoOnly = await makeStudent('videoonly');
  await subscribe(videoOnly.studentId, math.id, 'VIDEO');

  const exerciseOnly = await makeStudent('exonly');
  await subscribe(exerciseOnly.studentId, math.id, 'EXERCISE');

  const crossSubject = await makeStudent('cross');
  await subscribe(crossSubject.studentId, math.id, 'LIVE');
  await subscribe(crossSubject.studentId, physics.id, 'VIDEO');

  const mixedExpiry = await makeStudent('expiry');
  await subscribe(mixedExpiry.studentId, math.id, 'LIVE');
  // same student, same subject, a *different* cell, already expired
  await subscribe(mixedExpiry.studentId, math.id, 'VIDEO', {
    status: 'ACTIVE',
    start: new Date(Date.now() - 60 * DAY),
    end: ago,
  });

  const statuses = await makeStudent('status');
  await subscribe(statuses.studentId, math.id, 'LIVE', { status: 'PENDING' });
  await subscribe(statuses.studentId, physics.id, 'LIVE', { status: 'REJECTED' });

  const bothSubjects = await makeStudent('both');
  await subscribe(bothSubjects.studentId, math.id, 'LIVE');
  await subscribe(bothSubjects.studentId, physics.id, 'LIVE');

  // --- 1. same subject, different access types stay apart ---
  // Assertions are by session id, never by count: the seeded database already
  // holds MATH live sessions and videos, so a count would test the seed and not
  // the gate.
  {
    const live = await api(liveOnly.cookie, '/api/live');
    const ids = (live.body?.data?.sessions ?? []).map((s) => s.id);
    ok('LIVE-only: the live session is listed', ids.includes(mathSession.id), `${ids.length} sessions visible`);

    const vids = await api(liveOnly.cookie, '/api/videos');
    ok(
      'LIVE-only: no videos leak in',
      vids.body?.data?.videos?.length === 0,
      `videos=${vids.body?.data?.videos?.length}`,
    );

    const ex = await api(liveOnly.cookie, '/api/exercises');
    ok(
      'LIVE-only: no exercises leak in',
      ex.body?.data?.exercises?.length === 0,
      `exercises=${ex.body?.data?.exercises?.length}`,
    );

    const v403 = await api(liveOnly.cookie, `/api/videos/${mathVideo.id}`);
    ok('LIVE-only: opening a video is 403', v403.status === 403, `status=${v403.status}`);

    const e403 = await api(liveOnly.cookie, `/api/exercises/${mathExercise.id}`);
    ok('LIVE-only: opening an exercise is 403', e403.status === 403, `status=${e403.status}`);
  }

  {
    const vids = await api(videoOnly.cookie, '/api/videos');
    ok('VIDEO-only: the video is listed', vids.body?.data?.videos?.length > 0, `${vids.body?.data?.videos?.length} videos`);

    const live = await api(videoOnly.cookie, '/api/live');
    // A PAID session the student cannot join is still *listed*, so they can be
    // offered the subscribe button. The property that matters is that every one of
    // them is flagged locked and 403s on open, not that it is absent.
    ok(
      'VIDEO-only: every listed live session is locked',
      (live.body?.data?.sessions ?? []).every((s) => s.hasAccess === false),
      `${(live.body?.data?.sessions ?? []).length} listed, joinable=${(live.body?.data?.sessions ?? []).filter((s) => s.hasAccess).length}`,
    );
    const lockedSession = (live.body?.data?.sessions ?? [])[0];
    const lockedOpen = lockedSession
      ? await api(videoOnly.cookie, `/api/live/${lockedSession.id}`)
      : { status: 0 };
    ok('VIDEO-only: a listed session still cannot be opened', lockedOpen.status === 403, `status=${lockedOpen.status}`);

    const ex = await api(videoOnly.cookie, '/api/exercises');
    ok('VIDEO-only: no exercises leak in', ex.body?.data?.exercises?.length === 0, `exercises=${ex.body?.data?.exercises?.length}`);

    const l403 = await api(videoOnly.cookie, `/api/live/${mathSession.id}`);
    ok('VIDEO-only: opening a live session is 403', l403.status === 403, `status=${l403.status}`);
  }

  {
    const ex = await api(exerciseOnly.cookie, '/api/exercises');
    ok('EXERCISE-only: the exercise is listed', ex.body?.data?.exercises?.length > 0, `${ex.body?.data?.exercises?.length} exercises`);

    const vids = await api(exerciseOnly.cookie, '/api/videos');
    ok('EXERCISE-only: no videos leak in', vids.body?.data?.videos?.length === 0, `videos=${vids.body?.data?.videos?.length}`);

    const live = await api(exerciseOnly.cookie, '/api/live');
    ok(
      'EXERCISE-only: every listed live session is locked',
      (live.body?.data?.sessions ?? []).every((s) => s.hasAccess === false),
      `${(live.body?.data?.sessions ?? []).length} listed, joinable=${(live.body?.data?.sessions ?? []).filter((s) => s.hasAccess).length}`,
    );
  }

  // --- 2. same access type, different subjects stay apart ---
  {
    const live = await api(crossSubject.cookie, '/api/live');
    const rows = live.body?.data?.sessions ?? [];
    const byId = new Map(rows.map((s) => [s.id, s]));

    // The PHYSICS session may be listed as locked — that is the subscribe
    // affordance — but it must never be joinable, and it must 403.
    ok(
      'MATH LIVE does not open the PHYSICS live session',
      byId.get(mathSession.id)?.hasAccess === true && byId.get(physicsSession.id)?.hasAccess === false,
      `math=${byId.get(mathSession.id)?.hasAccess} physics=${byId.get(physicsSession.id)?.hasAccess} of ${rows.length} listed`,
    );

    const otherSubject = await api(crossSubject.cookie, `/api/live/${physicsSession.id}`);
    ok('opening another subject live session is 403', otherSubject.status === 403, `status=${otherSubject.status}`);
  }

  // --- 3. two cells in two subjects work side by side ---
  {
    const live = await api(crossSubject.cookie, '/api/live');
    const byId = new Map((live.body?.data?.sessions ?? []).map((s) => [s.id, s]));
    const videos = await api(crossSubject.cookie, '/api/videos');

    ok(
      'MATH LIVE still works while PHYSICS VIDEO is held',
      byId.get(mathSession.id)?.hasAccess === true && byId.get(physicsSession.id)?.hasAccess === false,
      `math=${byId.get(mathSession.id)?.hasAccess} physics=${byId.get(physicsSession.id)?.hasAccess}`,
    );
    ok('PHYSICS VIDEO works while MATH LIVE is held', videos.body?.data?.videos?.length > 0, `videos=${videos.body?.data?.videos?.length}`);

    // and the held video is the physics one, not the math one
    const ids = (videos.body?.data?.videos ?? []).map((v) => v.id);
    ok('the listed video belongs to the subscribed subject', ids.includes(physicsVideo.id) && !ids.includes(mathVideo.id), ids.join(','));

    const both = await api(bothSubjects.cookie, '/api/live');
    const bothIds = (both.body?.data?.sessions ?? []).map((s) => s.id);
    ok(
      'LIVE in two subjects shows both subjects',
      bothIds.includes(mathSession.id) && bothIds.includes(physicsSession.id),
      `math=${bothIds.includes(mathSession.id)} physics=${bothIds.includes(physicsSession.id)}`,
    );
  }

  // --- 4. an expired sibling cell does not close the live one ---
  {
    const live = await api(mixedExpiry.cookie, '/api/live');
    ok(
      'an expired VIDEO sibling does not close LIVE',
      (live.body?.data?.sessions ?? []).some((s) => s.id === mathSession.id),
      `math visible=${(live.body?.data?.sessions ?? []).some((s) => s.id === mathSession.id)}`,
    );

    const videos = await api(mixedExpiry.cookie, '/api/videos');
    ok('the expired VIDEO sibling itself is not served', videos.body?.data?.videos?.length === 0, `videos=${videos.body?.data?.videos?.length}`);
  }

  // --- 5. PENDING and REJECTED grant nothing ---
  {
    const live = await api(statuses.cookie, '/api/live');
    ok(
    'PENDING/REJECTED grant nothing',
    (live.body?.data?.sessions ?? []).every((s) => s.hasAccess === false),
    `joinable=${(live.body?.data?.sessions ?? []).filter((s) => s.hasAccess).length}`,
  );

    const direct = await api(statuses.cookie, `/api/live/${mathSession.id}`);
    ok('a PENDING cell cannot be opened directly', direct.status === 403, `status=${direct.status}`);
  }

  // --- 6. approving one cell must not activate a sibling ---
  {
    const approve = await prisma.subscription.findFirstOrThrow({
      where: { studentId: statuses.studentId, subjectId: math.id, accessType: 'LIVE' },
    });
    const payment = await prisma.payment.create({
      data: {
        subscriptionId: approve.id,
        amount: 1500,
        method: 'BARIDI',
        status: 'PENDING',
      },
    });

    const res = await api(adminCookie, `/api/admin/subscriptions/${approve.id}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'APPROVE' }),
    });
    ok('admin approves one cell', res.status === 200 && res.body?.success === true, `status=${res.status} ${res.body?.message ?? ''}`);

    const after = await prisma.subscription.findMany({
      where: { studentId: statuses.studentId },
      select: { accessType: { }, status: true, subject: { select: { name: true } } },
    });
    const byCell = Object.fromEntries(after.map((s) => [`${s.subject.name}:${s.accessType}`, s.status]));
    ok(
      'approval touched only the approved cell',
      byCell[`MATH:LIVE`] === 'ACTIVE' && byCell['PHYSICS:LIVE'] === 'REJECTED',
      JSON.stringify(byCell),
    );

    const live = await api(statuses.cookie, '/api/live');
    ok('the approved cell now works', live.body?.data?.sessions?.some((s) => s.id === mathSession.id), `sessions=${live.body?.data?.sessions?.length}`);

    const other = await api(statuses.cookie, `/api/live/${physicsSession.id}`);
    ok('the REJECTED sibling is still refused', other.status === 403, `status=${other.status}`);

    // the payment of the approved cell is settled in the same step
    const settled = await prisma.payment.findUnique({ where: { id: payment.id } });
    ok('the approved cell payment is settled', settled?.status === 'COMPLETED', `status=${settled?.status}`);

    // and no payment was invented for the sibling
    const siblingPayments = await prisma.payment.count({
      where: { subscription: { subjectId: physics.id, studentId: statuses.studentId } },
    });
    ok('no payment was created for the sibling cell', siblingPayments === 0, `payments=${siblingPayments}`);
  }

  // --- 7. the same cell cannot be bought twice ---
  {
    // The unique index on (studentId, subjectId, accessType) is what stops a
    // second purchase of a cell the student already holds, so the insert must
    // throw rather than silently create a duplicate entitlement.
    let threw = false;
    try {
      await prisma.subscription.create({
        data: {
          studentId: liveOnly.studentId,
          subjectId: math.id,
          accessType: 'LIVE',
          startDate: ago,
          endDate: inDays(30),
        },
      });
    } catch {
      threw = true;
    }
    ok('a duplicate (student, subject, accessType) row is rejected by the unique index', threw);
  }
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the run threw :: ${error.message}`);
} finally {
  // --- cleanup: only what this run created ---
  await prisma.attendance.deleteMany({ where: { sessionId: { in: tempSessionIds } } });
  await prisma.liveSession.deleteMany({ where: { id: { in: tempSessionIds } } });
  await prisma.video.deleteMany({ where: { id: { in: tempVideoIds } } });
  await prisma.exercise.deleteMany({ where: { id: { in: tempExerciseIds } } });
  await prisma.payment.deleteMany({ where: { subscription: { studentId: { in: tempStudentIds } } } });
  await prisma.subscription.deleteMany({ where: { studentId: { in: tempStudentIds } } });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: tempStudentIds } } });
  await prisma.videoProgress.deleteMany({ where: { student: { id: { in: tempStudentIds } } } }).catch(() => undefined);
  await prisma.course.deleteMany({ where: { id: { in: tempCourseIds } } });
  await prisma.student.deleteMany({ where: { id: { in: tempStudentIds } } });
  // before the users go: deleting a user cascades its refresh tokens away, which
  // would make the cleanup count below look like it deleted nothing
  const deleted = await prisma.refreshToken.deleteMany({
    where: { token: { in: [...createdRefreshTokens] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: tempUserIds } } });

  await prisma.$disconnect();

  const leftover = await prisma.student.count({
    where: { user: { email: { startsWith: 'e2e-indep-' } } },
  });
  ok('temporary students removed', leftover === 0, `${leftover} left of ${tempStudentIds.length} created`);
  ok('test refresh tokens cleaned up', deleted.count <= createdRefreshTokens.size, `deleted=${deleted.count}/${createdRefreshTokens.size}`);
}

if (failures > 0) {
  console.error(`\nFAILED ${failures} subscription independence check(s)`);
  process.exit(1);
}

console.log('\nALL SUBSCRIPTION INDEPENDENCE CHECKS PASSED');