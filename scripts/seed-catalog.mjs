/**
 * Recreate the subject/level catalog and nothing else.
 *
 * The catalog is the part of `npm run seed` that a deployment can be missing when
 * nobody ran it — and it is the part that used to be unrecoverable from the app.
 * Kept as its own module so a test that wipes the catalog can put it back without
 * re-seeding users, courses or subscriptions.
 *
 * There are no price cells any more. It used to create three `SubjectAccess` rows
 * per subject here, because a subject with no prices had nothing a student could
 * buy and so looked configured while being unusable. Nothing is sold now, and
 * those rows would be dead config the migration removed.
 */
const LEVELS = ['1AM', '2AM', '3AM', '4AM', '1AS', '2AS', '3AS'];

const SUBJECTS = [
  { name: 'MATH', nameAr: 'الرياضيات', icon: '📐', color: '#4F46E5' },
  { name: 'PHYSICS', nameAr: 'الفيزياء', icon: '⚛️', color: '#0EA5E9' },
  { name: 'SCIENCE', nameAr: 'العلوم', icon: '🔬', color: '#10B981' },
  { name: 'ARABIC', nameAr: 'اللغة العربية', icon: '📖', color: '#F59E0B' },
  { name: 'FRENCH', nameAr: 'اللغة الفرنسية', icon: '🇫🇷', color: '#EC4899' },
];

/**
 * `force` mirrors the intent `seed.ts` had: a run restores the baseline rather
 * than trusting whatever a test left behind. A deploy passes `force: false` so it
 * repairs without overwriting an admin's own labels.
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

  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({
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
  }

  return { subjects: SUBJECTS.length, levels: Math.max(levelCount, LEVELS.length) };
}

// run directly: `node scripts/seed-catalog.mjs`
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;

if (invokedDirectly) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const result = await seedCatalog(prisma);
  console.log(
    `catalog restored: ${result.subjects} subjects, ${result.levels} levels`,
  );
  await prisma.$disconnect();
}