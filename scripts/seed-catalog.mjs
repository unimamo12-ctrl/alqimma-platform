/**
 * Recreate the subject/level catalog and nothing else.
 *
 * The catalog is the part of `npm run seed` that a deployment can be missing when
 * nobody ran it — and it is the part that used to be unrecoverable from the app.
 * Kept as its own module so a test that wipes the catalog can put it back without
 * re-seeding users, courses or subscriptions.
 */
const LEVELS = ['1AM', '2AM', '3AM', '4AM', '1AS', '2AS', '3AS'];

const SUBJECTS = [
  { name: 'MATH', nameAr: 'الرياضيات', icon: '📐', color: '#4F46E5' },
  { name: 'PHYSICS', nameAr: 'الفيزياء', icon: '⚛️', color: '#0EA5E9' },
  { name: 'SCIENCE', nameAr: 'العلوم', icon: '🔬', color: '#10B981' },
  { name: 'ARABIC', nameAr: 'اللغة العربية', icon: '📖', color: '#F59E0B' },
  { name: 'FRENCH', nameAr: 'اللغة الفرنسية', icon: '🇫🇷', color: '#EC4899' },
];

const ACCESS_PRICES = {
  LIVE: { price: 1500, durationDays: 30 },
  VIDEO: { price: 2000, durationDays: 90 },
  EXERCISE: { price: 1000, durationDays: 90 },
};

/**
 * `force` mirrors `Course.isPublished` / `SubjectAccess.isActive` in `seed.ts`:
 * a run must restore the baseline rather than trust whatever a test left behind.
 */
export async function seedCatalog(prisma, { force = true } = {}) {
  const levelCount = await prisma.level.count();

  for (const [index, name] of LEVELS.entries()) {
    await prisma.level.upsert({
      where: { name },
      update: {},
      create: { name, order: index + 1 },
    });
  }

  let cells = 0;
  for (const subject of SUBJECTS) {
    const row = await prisma.subject.upsert({
      where: { name: subject.name },
      update: force
        ? { nameAr: subject.nameAr, icon: subject.icon, color: subject.color }
        : {},
      create: {
        name: subject.name,
        nameAr: subject.nameAr,
        icon: subject.icon,
        color: subject.color,
      },
    });

    for (const [accessType, cfg] of Object.entries(ACCESS_PRICES)) {
      await prisma.subjectAccess.upsert({
        where: { subjectId_accessType: { subjectId: row.id, accessType } },
        update: force ? { isActive: true } : {},
        create: {
          subjectId: row.id,
          accessType,
          price: cfg.price,
          durationDays: cfg.durationDays,
        },
      });
      cells += 1;
    }
  }

  return { subjects: SUBJECTS.length, levels: Math.max(levelCount, LEVELS.length), priceCells: cells };
}

// run directly: `node scripts/seed-catalog.mjs`
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;

if (invokedDirectly) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const result = await seedCatalog(prisma);
  console.log(
    `catalog restored: ${result.subjects} subjects, ${result.levels} levels, ${result.priceCells} price cells`,
  );
  await prisma.$disconnect();
}