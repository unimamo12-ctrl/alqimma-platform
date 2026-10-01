/**
 * Test account seeder.
 *
 * Creates a small matrix of accounts that covers every interesting state of the
 * subscription system, so the gating can be exercised without hand-editing the
 * database:
 *
 *   - a student with nothing, to see every "subscribe now" prompt
 *   - a student whose request is awaiting admin approval (access must stay shut)
 *   - a student with one ACTIVE VIDEO row, to prove the three access types are
 *     independent (live and exercises must still be refused)
 *   - a student with all three access types in one subject, to see the fully
 *     unlocked state
 *   - a student with several subjects, to check the "all live streams" list
 *   - a second teacher, so the teachers page and role switch are not degenerate
 *   - an admin, to drive the approve/reject screen
 *
 * Safe to re-run: every row is upserted by a stable id or unique key, so it
 * converges instead of duplicating. Run with `npm run seed:test`.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'password123';

/** Remove anything a previous run of this script left behind. */
async function clearPreviousRun() {
  const emails = [
    'test-no-sub@alqimma.com',
    'test-pending@alqimma.com',
    'test-video-only@alqimma.com',
    'test-all-access@alqimma.com',
    'test-multi-subject@alqimma.com',
    'test-teacher2@alqimma.com',
    'test-admin@alqimma.com',
  ];

  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  const students = await prisma.student.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const studentIds = students.map((s) => s.id);
  const teachers = await prisma.teacher.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const teacherIds = teachers.map((t) => t.id);

  // order matters: children before parents
  if (teacherIds.length) {
    await prisma.liveSession.deleteMany({ where: { teacherId: { in: teacherIds } } });
  }
  if (studentIds.length) {
    await prisma.quizAnswer.deleteMany({ where: { attempt: { studentId: { in: studentIds } } } });
    await prisma.quizAttempt.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.quizAssignment.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.subscription.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.attendance.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.videoProgress.deleteMany({ where: { studentId: { in: studentIds } } });
  }
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.message.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.teacher.deleteMany({ where: { id: { in: teacherIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function ensureUser(
  email: string,
  role: 'STUDENT' | 'TEACHER' | 'ADMIN',
  hash: string,
) {
  return prisma.user.upsert({
    where: { email },
    update: { role, status: 'ACTIVE' },
    create: { email, password: hash, role, status: 'ACTIVE' },
  });
}

async function ensureStudent(
  email: string,
  hash: string,
  data: { firstName: string; lastName: string; level?: string; className?: string; phone?: string },
) {
  const user = await ensureUser(email, 'STUDENT', hash);
  const student = await prisma.student.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      firstName: data.firstName,
      lastName: data.lastName,
      level: data.level ?? '3AM',
      class: data.className ?? '3',
      phone: data.phone ?? '0555000000',
    },
  });
  return { user, student };
}

async function ensureTeacher(
  email: string,
  hash: string,
  data: { firstName: string; lastName: string; subjects: string[]; levels: string[]; bio?: string; isOnline?: boolean },
) {
  const user = await ensureUser(email, 'TEACHER', hash);
  const teacher = await prisma.teacher.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      firstName: data.firstName,
      lastName: data.lastName,
      subjects: data.subjects,
      levels: data.levels,
      bio: data.bio ?? null,
      isOnline: data.isOnline ?? false,
    },
  });
  return { user, teacher };
}

/**
 * Grant access by creating the ACTIVE subscription and its COMPLETED payment.
 *
 * The payment row is not decorative: the admin screen reads amounts and method
 * off it, and a subscription with no payment renders as a broken card.
 */
async function grantAccess(
  studentId: string,
  subjectId: string,
  accessType: 'LIVE' | 'VIDEO' | 'EXERCISE',
  method: 'BARIDI' | 'MOB' = 'BARIDI',
  transactionId?: string,
) {
  const cell = await prisma.subjectAccess.findUniqueOrThrow({
    where: { subjectId_accessType: { subjectId, accessType } },
  });

  const subscription = await prisma.subscription.upsert({
    where: {
      studentId_subjectId_accessType: { studentId, subjectId, accessType },
    },
    update: {
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: daysFromNow(cell.durationDays),
    },
    create: {
      studentId,
      subjectId,
      accessType,
      startDate: new Date(),
      endDate: daysFromNow(cell.durationDays),
      status: 'ACTIVE',
      payments: {
        create: {
          amount: cell.price,
          method,
          status: 'COMPLETED',
          transactionId: transactionId ?? `TEST-${accessType}-${studentId.slice(-5)}`,
        },
      },
    },
  });

  return { subscription, price: cell.price };
}

/** A request awaiting admin verification: PENDING subscription and payment. */
async function requestAccess(
  studentId: string,
  subjectId: string,
  accessType: 'LIVE' | 'VIDEO' | 'EXERCISE',
  method: 'BARIDI' | 'MOB' = 'MOB',
) {
  const cell = await prisma.subjectAccess.findUniqueOrThrow({
    where: { subjectId_accessType: { subjectId, accessType } },
  });

  return prisma.subscription.upsert({
    where: {
      studentId_subjectId_accessType: { studentId, subjectId, accessType },
    },
    update: { status: 'PENDING' },
    create: {
      studentId,
      subjectId,
      accessType,
      startDate: new Date(),
      endDate: daysFromNow(cell.durationDays),
      status: 'PENDING',
      payments: {
        create: {
          amount: cell.price,
          method,
          status: 'PENDING',
          transactionId: `PENDING-${accessType}-${studentId.slice(-5)}`,
        },
      },
    },
  });
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  await clearPreviousRun();

  const math = await prisma.subject.findUniqueOrThrow({ where: { name: 'MATH' } });
  const physics = await prisma.subject.findUniqueOrThrow({ where: { name: 'PHYSICS' } });
  const science = await prisma.subject.findUniqueOrThrow({ where: { name: 'SCIENCE' } });
  const level3 = await prisma.level.findUniqueOrThrow({ where: { name: '3AM' } });

  // ---- teachers ----
  const { teacher: teacher2 } = await ensureTeacher('test-teacher2@alqimma.com', hash, {
    firstName: 'سعاد',
    lastName: 'بن يحيى',
    subjects: ['الفيزياء'],
    levels: ['4AM', '1AS', '2AS'],
    bio: 'أستاذة فيزياء، تشرحPropagation الموجات والضوء بأمثلة من الحياة اليومية.',
    isOnline: true,
  });

  // ---- admin ----
  await ensureUser('test-admin@alqimma.com', 'ADMIN', hash);

  // ---- student 1: nothing at all ----
  await ensureStudent('test-no-sub@alqimma.com', hash, {
    firstName: 'ياسين',
    lastName: 'بلحاج',
    phone: '0555111111',
  });

  // ---- student 2: request awaiting verification ----
  const { student: pending } = await ensureStudent('test-pending@alqimma.com', hash, {
    firstName: 'أمينة',
    lastName: 'قاسمي',
    phone: '0555222222',
  });
  await requestAccess(pending.id, math.id, 'LIVE', 'MOB');

  // ---- student 3: VIDEO only, to prove the access types are independent ----
  const { student: videoOnly } = await ensureStudent('test-video-only@alqimma.com', hash, {
    firstName: 'كريم',
    lastName: 'سعيد',
    phone: '0555333333',
  });
  await grantAccess(videoOnly.id, math.id, 'VIDEO', 'BARIDI', 'TEST-CCP-001');

  // ---- student 4: all three access types in one subject ----
  const { student: allAccess } = await ensureStudent('test-all-access@alqimma.com', hash, {
    firstName: 'نسرين',
    lastName: 'حمداني',
    phone: '0555444444',
  });
  await grantAccess(allAccess.id, math.id, 'LIVE', 'BARIDI');
  await grantAccess(allAccess.id, math.id, 'VIDEO', 'MOB');
  await grantAccess(allAccess.id, math.id, 'EXERCISE', 'BARIDI');

  // ---- student 5: several subjects, so the live list has more than one row ----
  const { student: multi } = await ensureStudent('test-multi-subject@alqimma.com', hash, {
    firstName: 'رفيق',
    lastName: 'عمراني',
    phone: '0555555555',
  });
  await grantAccess(multi.id, math.id, 'LIVE');
  await grantAccess(multi.id, math.id, 'VIDEO');
  await grantAccess(multi.id, physics.id, 'VIDEO');
  await grantAccess(multi.id, science.id, 'EXERCISE');

  // ---- a live session owned by the second teacher, so /live is not empty ----
  const course = await prisma.course.findFirst({ where: { subjectId: math.id } });
  if (course) {
    await prisma.liveSession.upsert({
      where: { id: 'test-live-math-session' },
      update: { status: 'LIVE', scheduledAt: new Date(Date.now() - 5 * 60 * 1000) },
      create: {
        id: 'test-live-math-session',
        teacherId: teacher2.id,
        courseId: course.id,
        title: 'حصة اختبار: معادلات الدرجة الثانية',
        description: 'بث تجريبي لاختبار شاشة البثوث المباشرة',
        scheduledAt: new Date(Date.now() - 5 * 60 * 1000),
        status: 'LIVE',
      },
    });
    await prisma.liveSession.upsert({
      where: { id: 'test-live-physics-session' },
      update: {},
      create: {
        id: 'test-live-physics-session',
        teacherId: teacher2.id,
        courseId: (await prisma.course.findFirst({ where: { subjectId: physics.id } }))?.id ?? course.id,
        title: 'حصة اختبار: Propagation الموجات',
        description: 'بث مجدول لاختبار حالة "مجدولة"',
        scheduledAt: daysFromNow(2),
        status: 'SCHEDULED',
      },
    });
  }

  console.log('تم إنشاء حسابات الاختبار (كلمة المرور للجميع: password123)\n');

  console.log('الإدارة:');
  console.log('  test-admin@alqimma.com        مدير — للتحقق من الاشتراكات وقبولها/رفضها');

  console.log('\nالأساتذة:');
  console.log('  test-teacher2@alqimma.com    أ. سعاد بن يحيى — فيزياء، متصلة');

  console.log('\nالطلبة:');
  console.log('  test-no-sub@alqimma.com         بلا أي اشتراك — كل شيء يطلب اشتراكاً');
  console.log('  test-pending@alqimma.com       طلب معلّق — بانتظار تحقق الإدارة');
  console.log('  test-video-only@alqimma.com    اشتراك VIDEO فقط (الرياضيات)');
  console.log('                                   ← البث والتمارين يجب أن يرفضا');
  console.log('  test-all-access@alqimma.com    LIVE + VIDEO + EXERCISE (الرياضيات)');
  console.log('  test-multi-subject@alqimma.com  عدة مواد: بث+فيديو (رياضيات)، فيديو (فيزياء)، تمارين (علوم)');

  console.log('\nللاختبار اليدوي:');
  console.log('  1) ادخل بـ test-pending@alqimma.com وافتح /account — الطلب يظهر "بانتظار تحقق الإدارة"');
  console.log('  2) ادخل بـ test-admin@alqimma.com وافتح /admin/subscriptions — اقبل الطلب');
  console.log('  3) ارجع إلى test-pending@alqimma.com — صار الاشتراك نشطاً');

  const totals = await prisma.subscription.count();
  console.log(`\nإجمالي الاشتراكات في القاعدة الآن: ${totals} (المستوى 3AM موجود: ${Boolean(level3)})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });