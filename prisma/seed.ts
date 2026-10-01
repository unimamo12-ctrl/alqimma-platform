import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const LEVELS = ['1AM', '2AM', '3AM', '4AM', '1AS', '2AS', '3AS'];
const SUBJECTS = [
  { name: 'MATH', nameAr: 'الرياضيات', icon: '📐', color: '#4F46E5' },
  { name: 'PHYSICS', nameAr: 'الفيزياء', icon: '⚛️', color: '#0EA5E9' },
  { name: 'SCIENCE', nameAr: 'العلوم', icon: '🔬', color: '#10B981' },
  { name: 'ARABIC', nameAr: 'اللغة العربية', icon: '📖', color: '#F59E0B' },
  { name: 'FRENCH', nameAr: 'اللغة الفرنسية', icon: '🇫🇷', color: '#EC4899' },
];

const ACCESS_PRICES: Record<string, { price: number; durationDays: number }> = {
  LIVE: { price: 1500, durationDays: 30 },
  VIDEO: { price: 2000, durationDays: 90 },
  EXERCISE: { price: 1000, durationDays: 90 },
};

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@alqimma.com' },
    update: {},
    create: {
      email: 'admin@alqimma.com',
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@alqimma.com' },
    update: {},
    create: {
      email: 'teacher@alqimma.com',
      password: hashedPassword,
      role: 'TEACHER',
      status: 'ACTIVE',
      teacher: {
        create: {
          firstName: 'أمين',
          lastName: 'بن محمد',
          bio: 'أستاذ رياضيات بخبرة 15 عامًا في تدريس المرحلتين المتوسطة والثانوية',
          subjects: ['الرياضيات'],
          levels: ['1AM', '2AM', '3AM', '4AM', '1AS', '2AS', '3AS'],
          isOnline: true,
        },
      },
    },
  });

  const teacher = await prisma.teacher.findUniqueOrThrow({
    where: { userId: teacherUser.id },
  });

  const studentUser = await prisma.user.upsert({
    where: { email: 'student@alqimma.com' },
    update: {},
    create: {
      email: 'student@alqimma.com',
      password: hashedPassword,
      role: 'STUDENT',
      status: 'ACTIVE',
      student: {
        create: {
          firstName: 'محمد',
          lastName: 'علي',
          phone: '0555123456',
          level: '3AM',
          class: '3',
        },
      },
    },
  });

  const student = await prisma.student.findUniqueOrThrow({
    where: { userId: studentUser.id },
  });

  for (const [index, name] of LEVELS.entries()) {
    await prisma.level.upsert({
      where: { name },
      update: {},
      create: { name, nameAr: name, order: index + 1 },
    });
  }

  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({
      where: { name: subject.name },
      update: {},
      create: subject,
    });
  }

  const accessRows: Array<{ subjectId: string; accessType: string; price: number; durationDays: number }> = [];
  for (const subject of SUBJECTS) {
    const created = await prisma.subject.findUniqueOrThrow({ where: { name: subject.name } });
    for (const [accessType, cfg] of Object.entries(ACCESS_PRICES)) {
      const cell = await prisma.subjectAccess.upsert({
        where: {
          subjectId_accessType: { subjectId: created.id, accessType: accessType as never },
        },
        // Force the cell back on. Price and duration are left alone because a
        // wrong price is visible in the admin table, but a cell left inactive is
        // invisible *and* silently blocks every new subscription for it.
        update: { isActive: true },
        create: {
          subjectId: created.id,
          accessType: accessType as never,
          price: new Prisma.Decimal(cfg.price),
          durationDays: cfg.durationDays,
        },
      });
      accessRows.push({ subjectId: cell.id, accessType, price: cfg.price, durationDays: cfg.durationDays });
    }
  }

  const math = await prisma.subject.findUniqueOrThrow({ where: { name: 'MATH' } });
  const level3 = await prisma.level.findUniqueOrThrow({ where: { name: '3AM' } });

  const course = await prisma.course.upsert({
    where: { id: 'course-algebra-3am' },
    // Force the flags back on every run. A previous admin test that toggled
    // isPublished used to leave the seeded course hidden, and because
    // /api/videos filters on course.isPublished the whole recording E2E then
    // failed with the student "unable to see" a published video.
    //
    // `type: 'PAID'` is forced for the same reason. `CourseType` used to be read
    // by nothing, so a FREE default was harmless; now FREE really does open a
    // course to every student with no subscription, and leaving the demo course
    // at the schema default silently un-gated the whole platform.
    update: { isPublished: true, type: 'PAID' },
    create: {
      id: 'course-algebra-3am',
      teacherId: teacher.id,
      subjectId: math.id,
      levelId: level3.id,
      title: 'جبر السنة الثالثة متوسط',
      description: 'شرح مفصّل لمعادلات الدرجة الأولى والثانية مع تمارين محلولة',
      type: 'FREE',
      price: new Prisma.Decimal(0),
      isPublished: true,
    },
  });

  const videos = [
    {
      title: 'المعادلات من الدرجة الأولى',
      url: 'https://example.com/videos/equations-1.mp4',
      duration: 2400,
    },
    {
      title: 'المعادلات من الدرجة الثانية',
      url: 'https://example.com/videos/equations-2.mp4',
      duration: 3150,
    },
    {
      title: 'حل التمرين 12 صفحة 45',
      url: 'https://example.com/videos/exercise-12.mp4',
      duration: 1800,
    },
  ];

  for (const [index, video] of videos.entries()) {
    await prisma.video.upsert({
      where: { id: `video-${index + 1}` },
      update: {},
      create: {
        id: `video-${index + 1}`,
        courseId: course.id,
        title: video.title,
        description: `شرح ${video.title}`,
        url: video.url,
        duration: video.duration,
        order: index + 1,
        isPublished: true,
      },
    });
  }

  await prisma.file.upsert({
    where: { id: 'file-exercises-3am' },
    update: {},
    create: {
      id: 'file-exercises-3am',
      courseId: course.id,
      name: 'تمارين الجبر مع الحلول.pdf',
      description: 'ملف تمارين مرفق بالحلول النموذجية',
      url: 'https://example.com/files/exercises-3am.pdf',
      fileType: 'application/pdf',
      size: 1_450_752,
      isPublished: true,
    },
  });

  await prisma.exercise.upsert({
    where: { id: 'exercise-algebra-1' },
    update: {},
    create: {
      id: 'exercise-algebra-1',
      courseId: course.id,
      title: 'تمرين جبري شامل',
      description: 'خمسة أسئلة على المعادلات من الدرجة الأولى والثانية',
      duration: 30,
      questions: [
        {
          id: 'q1',
          text: 'حل المعادلة: 3x + 5 = 20',
          options: ['x = 3', 'x = 5', 'x = 7', 'x = 15'],
          correctAnswer: 1,
        },
        {
          id: 'q2',
          text: 'ما هو جذر المعادلة x² - 9 = 0؟',
          options: ['x = 3', 'x = -3', 'x = 3 أو x = -3', 'لا يوجد جذر'],
          correctAnswer: 2,
        },
        {
          id: 'q3',
          text: 'إذا كان a = 2 و b = -3 فما قيمة a² - b؟',
          options: ['1', '7', '4', '-1'],
          correctAnswer: 1,
        },
        {
          id: 'q4',
          text: 'حل المعادلة: (x - 1)(x + 4) = 0',
          options: ['x = 1', 'x = -4', 'x = 1 أو x = -4', 'x = 0'],
          correctAnswer: 2,
        },
        {
          id: 'q5',
          text: 'ما الشكل المميز لجدول دالة تربيعية؟',
          options: ['قطعة', 'مستقيم', 'مستقيم موازٍ للمحور', 'دائرة'],
          correctAnswer: 2,
        },
      ],
    },
  });

  const now = new Date();

  await prisma.liveSession.upsert({
    where: { id: 'live-algebra-review' },
    update: {},
    create: {
      id: 'live-algebra-review',
      teacherId: teacher.id,
      courseId: course.id,
      title: 'مراجعة شاملة لدرس الجبر',
      description: 'مراجعة على أسئلة الكتاب والواجب المنزلي',
      scheduledAt: new Date(now.getTime() + 60 * 60 * 1000),
      status: 'SCHEDULED',
    },
  });

  await prisma.enrollment.upsert({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
    update: {},
    create: { studentId: student.id, courseId: course.id },
  });

  const mathSubject = await prisma.subject.findUniqueOrThrow({ where: { name: 'MATH' } });

  const videoAccess = await prisma.subjectAccess.findUniqueOrThrow({
    where: { subjectId_accessType: { subjectId: mathSubject.id, accessType: 'VIDEO' } },
  });

  const subscription = await prisma.subscription.findFirst({
    where: { studentId: student.id, subjectId: mathSubject.id, accessType: 'VIDEO' },
  });

  const activeSubscription =
    subscription ??
    (await prisma.subscription.create({
      data: {
        studentId: student.id,
        subjectId: mathSubject.id,
        accessType: 'VIDEO',
        startDate: now,
        endDate: new Date(now.getTime() + videoAccess.durationDays * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      },
    }));

  await prisma.payment.upsert({
    where: { id: 'payment-seed-1' },
    update: {},
    create: {
      id: 'payment-seed-1',
      subscriptionId: activeSubscription.id,
      amount: new Prisma.Decimal(Number(videoAccess.price)),
      method: 'BARIDI',
      status: 'COMPLETED',
      transactionId: 'SEED-TXN-0001',
    },
  });

  const notifications = [
    {
      id: 'notif-seed-1',
      title: 'مراجعة شاملة لدرس الجبر',
      message: 'ستبدأ الحصة المباشرة بعد ساعة. سجّل الدخول للمشاركة.',
      type: 'LIVE_STARTED',
      link: '/teacher/live',
    },
    {
      id: 'notif-seed-2',
      title: 'ملف جديد متاح',
      message: 'تم نشر "تمارين الجبر مع الحلول.pdf" في دورة جبر السنة الثالثة متوسط.',
      type: 'NEW_CONTENT',
      link: '/student',
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.upsert({
      where: { id: notification.id },
      update: {},
      create: { ...notification, userId: studentUser.id },
    });
  }

  console.log('تم إنشاء البيانات التجريبية بنجاح.');
  console.log('  Admin:   admin@alqimma.com   / password123');
  console.log('  Teacher: teacher@alqimma.com / password123');
  console.log('  Student: student@alqimma.com / password123');
  console.log(`  Course:  ${course.title} (${videos.length} فيديوهات، ملف واحد، تمرين واحد)`);
  console.log(`  Access:  ${accessRows.length} خلية سعر | Levels: ${LEVELS.length} | Subjects: ${SUBJECTS.length}`);
  console.log(`  Enrolled student ${student.firstName} ${student.lastName} in course + active subscription`);
  console.log(`  Admin id: ${admin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
