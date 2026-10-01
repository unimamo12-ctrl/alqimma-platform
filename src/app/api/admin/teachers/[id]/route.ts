import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/auth';

const teacherSchema = z.object({
  email: z.string().trim().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(6, 'كلمة السر قصيرة').optional(),
  firstName: z.string().trim().min(1, 'الاسم الأول مطلوب'),
  lastName: z.string().trim().min(1, 'الاسم الأخير مطلوب'),
  bio: z.string().trim().max(1000).nullable().optional(),
  subjects: z.array(z.string().trim().min(1)).max(20).optional(),
  levels: z.array(z.string().trim().min(1)).max(20).optional(),
  isOnline: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

/**
 * Everything one teacher owns, plus their students.
 *
 * Counts come back alongside the rows so the summary tiles can be rendered
 * without the browser walking every array first.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 401 });
    }

    const { id } = await params;

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            emailVerified: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
        courses: {
          include: {
            subject: { select: { name: true, nameAr: true } },
            level: { select: { name: true } },
            _count: { select: { videos: true, liveSessions: true, exercises: true, enrollments: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        liveSessions: {
          include: {
            course: { select: { id: true, title: true } },
            _count: { select: { participants: true, messages: true } },
          },
          orderBy: { scheduledAt: 'desc' },
        },
        quizzes: {
          include: {
            _count: { select: { assignments: true, attempts: true, questions: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        announcements: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!teacher) {
      return NextResponse.json({ success: false, message: 'الأستاذ غير موجود' }, { status: 404 });
    }

    // The students are reached through the courses they can teach, not stored on
    // the teacher: there is no direct teacher/student relation in the schema.
    const courseIds = teacher.courses.map((c) => c.id);
    const students = await prisma.student.findMany({
      where: { enrollments: { some: { courseId: { in: courseIds } } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        level: true,
        class: true,
        user: { select: { email: true, status: true } },
      },
      orderBy: { lastName: 'asc' },
    });

    const videos = await prisma.video.findMany({
      where: { courseId: { in: courseIds } },
      select: {
        id: true,
        title: true,
        isPublished: true,
        duration: true,
        views: true,
        course: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const exercises = await prisma.exercise.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true, title: true, duration: true, course: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const files = await prisma.file.findMany({
      where: { courseId: { in: courseIds } },
      select: {
        id: true,
        name: true,
        fileType: true,
        size: true,
        isPublished: true,
        course: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: { teacher, students, videos, exercises, files },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.teacher.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'الأستاذ غير موجود' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'طلب غير صالح' }, { status: 400 });
    }

    const parsed = teacherSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const { email, password, firstName, lastName, bio, subjects, levels, isOnline, status } =
      parsed.data;

    const emailTaken = await prisma.user.findFirst({
      where: { email, NOT: { id: existing.user.id } },
      select: { id: true },
    });
    if (emailTaken) {
      return NextResponse.json(
        { success: false, message: 'البريد الإلكتروني مستخدم بالفعل' },
        { status: 400 },
      );
    }

    const teacher = await prisma.teacher.update({
      where: { id },
      data: {
        firstName,
        lastName,
        bio: bio ?? null,
        ...(subjects ? { subjects } : {}),
        ...(levels ? { levels } : {}),
        ...(typeof isOnline === 'boolean' ? { isOnline } : {}),
        user: {
          update: {
            email,
            ...(status ? { status } : {}),
            ...(password ? { password: await hashPassword(password) } : {}),
          },
        },
      },
      include: { user: { select: { email: true, status: true } } },
    });

    return NextResponse.json({ success: true, data: { teacher } });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.teacher.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'الأستاذ غير موجود' }, { status: 404 });
    }

    const [courses, liveSessions, quizzes, announcements] = await Promise.all([
      prisma.course.count({ where: { teacherId: id } }),
      prisma.liveSession.count({ where: { teacherId: id } }),
      prisma.quiz.count({ where: { teacherId: id } }),
      prisma.announcement.count({ where: { authorId: id } }),
    ]);

    const reasons: string[] = [];
    if (courses) reasons.push(`${courses} دورة`);
    if (liveSessions) reasons.push(`${liveSessions} بث`);
    if (quizzes) reasons.push(`${quizzes} اختبار`);
    if (announcements) reasons.push(`${announcements} إعلان`);

    if (reasons.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `لا يمكن حذف أستاذ لديه محتوى (${reasons.join('، ')}).يمكنك إيقاف حسابه بدل الحذف.`,
          data: { courses, liveSessions, quizzes, announcements },
        },
        { status: 409 },
      );
    }

    const teacher = await prisma.teacher.findUniqueOrThrow({ where: { id }, select: { userId: true } });
    await prisma.user.delete({ where: { id: teacher.userId } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}