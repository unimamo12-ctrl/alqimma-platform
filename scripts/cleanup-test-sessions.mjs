import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// `in` is an exact list, so anything a manual probe names differently survives
// every cleanup run and quietly accumulates. `startsWith` over the same
// prefixes catches those without widening into a substring match that could
// reach a real session.
const TEST_TITLE_PREFIXES = ['E2E', 'SMOKE', 'DBG', 'RECORD', 'PROBE'];

const TEST_TITLES = ['E2E WebRTC', 'SMOKE webrtc', 'SMOKE BROADCAST', 'DBG', 'RECORD E2E'];

const leftovers = await prisma.liveSession.findMany({
  where: {
    OR: [
      { title: { in: TEST_TITLES } },
      ...TEST_TITLE_PREFIXES.map((prefix) => ({ title: { startsWith: prefix } })),
    ],
  },
  select: { id: true, title: true, status: true, recordingUrl: true },
});

for (const row of leftovers) {
  await prisma.attendance.deleteMany({ where: { sessionId: row.id } });
  await prisma.liveSession.delete({ where: { id: row.id } });
  console.log(`removed ${row.title} ${row.status} ${row.id}`);
  if (row.recordingUrl?.startsWith('/uploads/')) {
    await unlink(join(process.cwd(), 'public', row.recordingUrl.replace(/^\//, ''))).catch(() => undefined);
  }
}

// recordings whose session is gone, plus any test-titled recording drafts
const orphanRecordings = await prisma.video.findMany({
  where: { title: { contains: 'تسجيل:' } },
  select: { id: true, title: true, url: true },
});
for (const video of orphanRecordings) {
  await prisma.video.delete({ where: { id: video.id } });
  if (video.url?.startsWith('/uploads/')) {
    await unlink(join(process.cwd(), 'public', video.url.replace(/^\//, ''))).catch(() => undefined);
  }
  console.log(`removed orphan recording draft ${video.title}`);
}

const remaining = await prisma.liveSession.count();
console.log(`removed ${leftovers.length} test sessions and ${orphanRecordings.length} recording drafts, ${remaining} live sessions remain`);

await prisma.$disconnect();
