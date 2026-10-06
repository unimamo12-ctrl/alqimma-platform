import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { requireTeacherOrAdmin, ownsCourse } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول أولاً' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedTeacherId = searchParams.get('teacherId');
    const includeEnded = searchParams.get('all') === 'true' && session.role !== 'STUDENT';

    const where: Prisma.LiveSessionWhereInput = {};

    if (session.role === 'STUDENT') {
      /*
       * No payment gate: a student sees every published session, joinable.
       *
       * This route used to build a per-student allow-list from ACTIVE
       * subscriptions, list a locked card for the rest, and send `hasAccess` per
       * session so the card could offer "اشترك" instead of a join button. With
       * no subscriptions there is nothing to be locked against, so the whole
       * branch collapses to "published courses only" and `hasAccess` is gone from
       * the payload. A student page that still reads `hasAccess` sees `undefined`,
       * which the card must treat as *not* locked.
       */
      where.OR = [
        { status: { in: ['SCHEDULED', 'LIVE'] } },
        { status: 'ENDED', isRecorded: true, recordingUrl: { not: null } },
      ];

      where.course = { isPublished: true };
    } else if (session.role === 'TEACHER') {
      if (!session.teacher) {
        return NextResponse.json(
          { success: false, message: 'لا يوجد ملف أستاذ' },
          { status: 403 }
        );
      }
      where.teacherId = requestedTeacherId ?? session.teacher.id;
      if (where.teacherId !== session.teacher.id) {
        return NextResponse.json(
          { success: false, message: 'غير مصرح' },
          { status: 403 }
        );
      }
      if (!includeEnded) where.status = { in: ['SCHEDULED', 'LIVE'] };
    } else {
      if (requestedTeacherId) where.teacherId = requestedTeacherId;
      if (!includeEnded) where.status = { in: ['SCHEDULED', 'LIVE'] };
    }

    const sessions = await prisma.liveSession.findMany({
      where,
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            subjectId: true,
            subject: { select: { id: true, name: true, nameAr: true } },
            level: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: { sessions },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const body = await request.json();
    const { courseId, title, description, thumbnail, scheduledAt, startNow } = body;

    if (!courseId || !title) {
      return NextResponse.json(
        { success: false, message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' },
        { status: 400 }
      );
    }

    const startImmediately = startNow === true;

    if (!startImmediately && !scheduledAt) {
      return NextResponse.json(
        { success: false, message: 'يجب تحديد موعد البث أو اختيار البدء الآن' },
        { status: 400 }
      );
    }

    const when = startImmediately ? new Date() : new Date(scheduledAt);

    if (Number.isNaN(when.getTime())) {
      return NextResponse.json(
        { success: false, message: 'تاريخ البث غير صالح' },
        { status: 400 }
      );
    }

    if (when.getTime() < Date.now() - 60 * 60 * 1000) {
      return NextResponse.json(
        { success: false, message: 'لا يمكن جدولة بث في الماضي' },
        { status: 400 }
      );
    }

    if (!(await ownsCourse(session, courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بإنشاء بث لهذه الدورة' },
        { status: 403 }
      );
    }

    const teacherId = session.teacher?.id;

    if (!teacherId) {
      return NextResponse.json(
        { success: false, message: 'لا يوجد ملف أستاذ مرتبط بالحساب' },
        { status: 400 }
      );
    }


    const liveSession = await prisma.liveSession.create({
      data: {
        teacherId,
        courseId,
        title,
        description,
        thumbnail,
        scheduledAt: when,
        status: startImmediately ? 'LIVE' : 'SCHEDULED',
      },
      include: {
        course: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: { session: liveSession },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
