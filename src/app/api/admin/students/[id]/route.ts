import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/auth';

const studentSchema = z.object({
  email: z.string().trim().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(6, 'كلمة السر قصيرة').optional(),
  firstName: z.string().trim().min(1, 'الاسم الأول مطلوب'),
  lastName: z.string().trim().min(1, 'الاسم الأخير مطلوب'),
  phone: z.string().trim().max(30).nullable().optional(),
  level: z.string().trim().max(30).nullable().optional(),
  class: z.string().trim().max(30).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

/**
 * Update or delete a student as an admin.
 *
 * Child rows are NOT cascaded on purpose. Deleting the User row alone would
 * leave attendance, quiz attempts and subscriptions pointing at a student that
 * no longer exists, which the schema's onDelete: Cascade on Student would then
 * take out anyway — so the guard below refuses instead of destroying a
 * student's history by accident. Removing a student with history is a decision,
 * not an edit.
 */
/**
 * Everything about one student, in one payload.
 *
 * Deliberately a single query per relation rather than six route calls: this is
 * the page an admin opens when something is wrong with an account, and a
 * half-loaded page hides exactly the gap they came to look at.
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

    const student = await prisma.student.findUnique({
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
            _count: { select: { refreshTokens: true } },
          },
        },
        subscriptions: {
          include: { payments: true, subject: { select: { id: true, name: true, nameAr: true } } },
          orderBy: { createdAt: 'desc' },
        },
        enrollments: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                isPublished: true,
                subject: { select: { name: true, nameAr: true } },
                level: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        quizAttempts: {
          include: {
            quiz: { select: { id: true, title: true, status: true } },
          },
          orderBy: { startedAt: 'desc' },
        },
        attendances: {
          include: {
            session: {
              select: {
                id: true,
                title: true,
                status: true,
                scheduledAt: true,
                course: { select: { title: true } },
              },
            },
          },
          orderBy: { joinTime: 'desc' },
        },
        progress: {
          include: {
            video: {
              select: {
                id: true,
                title: true,
                duration: true,
                course: { select: { title: true } },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ success: false, message: 'الطالب غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { student } });
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

    const existing = await prisma.student.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'الطالب غير موجود' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'طلب غير صالح' }, { status: 400 });
    }

    const parsed = studentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const { email, password, firstName, lastName, phone, level, class: className, status } = parsed.data;

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

    const student = await prisma.student.update({
      where: { id },
      data: {
        firstName,
        lastName,
        phone: phone ?? null,
        level: level ?? null,
        class: className ?? null,
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

    return NextResponse.json({ success: true, data: { student } });
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

    const existing = await prisma.student.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'الطالب غير موجود' }, { status: 404 });
    }

    const [attempts, attendance, subscriptions, enrollments] = await Promise.all([
      prisma.quizAttempt.count({ where: { studentId: id } }),
      prisma.attendance.count({ where: { studentId: id } }),
      prisma.subscription.count({ where: { studentId: id } }),
      prisma.enrollment.count({ where: { studentId: id } }),
    ]);

    const reasons: string[] = [];
    if (attempts) reasons.push(`${attempts} محاولة اختبار`);
    if (attendance) reasons.push(`${attendance} سجل حضور`);
    if (subscriptions) reasons.push(`${subscriptions} اشتراك`);
    if (enrollments) reasons.push(`${enrollments} تسجيل في دورة`);

    if (reasons.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `لا يمكن حذف طالب لديه سجلات (${reasons.join('، ')}).يمكنك إيقاف حسابه بدل الحذف.`,
          data: { attempts, attendance, subscriptions, enrollments },
        },
        { status: 409 },
      );
    }

    // No history, so removing the profile is safe.
    await prisma.user.delete({ where: { id: (await prisma.student.findUniqueOrThrow({ where: { id } })).userId } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}