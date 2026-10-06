/**
 * Data integrity: anything pointing at a row that no longer exists.
 *
 * Every relation here is declared with `onDelete: Cascade`, so a delete normally
 * cleans up after itself. The sweep exists because "normally" is doing a lot of
 * work: a nullable link or a string id in a `link` column has no foreign key to
 * protect it, and the notification bug that started this found exactly that.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const problems = [];
const note = (m) => problems.push(m);

/*
 * Relations with a non-nullable foreign key cannot orphan — the database
 * rejects the delete — so counting them is not worth a query. What *can* rot is
 * anything held in a plain column with nothing enforcing it, plus rows whose
 * meaning has drifted from their status.
 */

// notification links are plain strings: nothing enforces that the target exists
const notifications = await prisma.notification.findMany({
  select: { id: true, title: true, link: true },
});
let deadLinks = 0;
for (const n of notifications) {
  const m = /^\/(?:student|teacher)\/(quizzes|live|videos|files)\/([A-Za-z0-9]+)$/.exec(n.link ?? '');
  if (!m) continue;
  const [, kind, id] = m;
  const exists =
    kind === 'quizzes'
      ? await prisma.quiz.findUnique({ where: { id }, select: { id: true } })
      : kind === 'live'
        ? await prisma.liveSession.findUnique({ where: { id }, select: { id: true } })
        : await prisma.video.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    deadLinks += 1;
    note(`notification "${n.title}" links to a missing ${kind}: ${n.link}`);
  }
}

// a recorded session must have the url the replay link depends on
const recordedNoUrl = await prisma.liveSession.count({
  where: { isRecorded: true, OR: [{ recordingUrl: null }, { recordingUrl: '' }] },
});
if (recordedNoUrl > 0) note(`${recordedNoUrl} sessions flagged recorded without a recordingUrl`);

// a session that ended but has no end date hides it from nothing but looks wrong
const endedNoStamp = await prisma.liveSession.count({
  where: { status: 'ENDED', endedAt: null },
});
if (endedNoStamp > 0) note(`${endedNoStamp} ENDED sessions with no endedAt`);

// a published video in an unpublished course is unreachable: both are checked
const unreachableVideos = await prisma.video.count({
  where: { isPublished: true, course: { isPublished: false } },
});
if (unreachableVideos > 0) note(`${unreachableVideos} published videos inside an unpublished course`);

// the foreign keys themselves: a broken one means a delete left a row behind
const backRefs = {
  videosWithoutCourse: await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "videos" v
    LEFT JOIN "courses" c ON c.id = v."courseId" WHERE c.id IS NULL`,
  sessionsWithoutCourse: await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "live_sessions" l
    LEFT JOIN "courses" c ON c.id = l."courseId" WHERE c.id IS NULL`,
  attemptsWithoutQuiz: await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "quiz_attempts" a
    LEFT JOIN "quizzes" q ON q.id = a."quizId" WHERE q.id IS NULL`,
};

/*
 * The payment tables must be *gone*, not merely unread.
 *
 * A removal that left `subscriptions` behind would pass every other check here:
 * nothing selects it, so nothing reports an orphan, and the script would report
 * clean while the feature it claims to have removed was still there. Asserting
 * their absence from `information_schema` is what makes this check able to fail
 * for the reason it exists.
 */
const leftovers = await prisma.$queryRaw`
  SELECT table_name AS name FROM information_schema.tables
  WHERE table_schema = current_schema()
    AND table_name IN ('payments', 'subscriptions', 'subject_access')`;
for (const row of leftovers) note(`table still exists after the payment removal: ${row.name}`);

const removedColumns = await prisma.$queryRaw`
  SELECT column_name AS name FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'courses'
    AND column_name IN ('type', 'price')`;
for (const row of removedColumns) note(`courses.${row.name} still exists`);

const publishedCourses = await prisma.course.count({ where: { isPublished: true } });

const summary = {
  subjects: await prisma.subject.count(),
  levels: await prisma.level.count(),
  courses: await prisma.course.count(),
  publishedCourses,
  liveSessions: await prisma.liveSession.count(),
  videos: await prisma.video.count(),
  exercises: await prisma.exercise.count(),
  quizzes: await prisma.quiz.count(),
  notifications: notifications.length,
  deadLinks,
  unreachableVideos,
  recordedNoUrl,
  endedNoStamp,
};

console.log('data:', JSON.stringify(summary));
console.log('foreign keys:', JSON.stringify(backRefs));

for (const [name, rows] of Object.entries(backRefs)) {
  const n = Array.isArray(rows) ? Number(rows[0]?.n ?? 0) : 0;
  if (n > 0) note(`${n} rows with a broken foreign key: ${name}`);
}

await prisma.$disconnect();

if (problems.length > 0) {
  console.error(`\n${problems.length} INTEGRITY PROBLEM(S):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}

console.log('\nDATA INTEGRITY OK');