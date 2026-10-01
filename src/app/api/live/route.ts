import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { requireTeacherOrAdmin, ownsCourse } from '@/lib/auth/guards';
import { accessibleSubjectIds } from '@/lib/subscriptions/access';

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
       * A student sees three kinds of session:
       *
       *  - in a FREE course: joinable, no subscription involved;
       *  - in a PAID course they hold LIVE access for: joinable;
       *  - in a PAID course they do *not* hold it for: listed but locked.
       *
       * The third kind used to be filtered out, which was defensible and useless:
       * a student could not tell there was a broadcast to subscribe to, because
       * the card simply was not there, and the only route to the subscribe button
       * was a course they happened to already know about. A locked card that
       * says "اشترك" is what turns an existing broadcast into a sale.
       *
       * A PAID session is only offered as lockable when the LIVE price cell for
       * its subject is active. If it is deactivated, subscribing is impossible, so
       * showing the card would be a dead end with no way to act on it.
       */
      const studentId = session.student?.id ?? null;
      const [allowedSubjects, activeLiveCells] = await Promise.all([
        studentId ? accessibleSubjectIds(studentId, 'LIVE') : Promise.resolve([]),
        prisma.subjectAccess.findMany({
          where: { accessType: 'LIVE', isActive: true },
          select: { subjectId: true },
        }),
      ]);

      const subscribable = activeLiveCells.map((cell) => cell.subjectId);
      const offerable = [...new Set([...allowedSubjects, ...subscribable])];

      where.OR = [
        { status: { in: ['SCHEDULED', 'LIVE'] } },
        { status: 'ENDED', isRecorded: true, recordingUrl: { not: null } },
      ];

      where.course = {
        AND: [
          { isPublished: true },
          {
            OR: [
              { type: 'FREE' },
              ...(offerable.length > 0 ? [{ type: 'PAID' as const, subjectId: { in: offerable } }] : []),
            ],
          },
        ],
      };
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
            // the student's UI decides between "join now" and "subscribe" from
            // these three, so they have to travel with every session
            type: true,
            subjectId: true,
            subject: { select: { id: true, name: true, nameAr: true } },
            level: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    // A student needs to be told, per session, whether they may join it — a
    // locked card that still renders a join button is a 403 waiting to happen.
    const allowedSubjects =
      session.role === 'STUDENT' && session.student
        ? await accessibleSubjectIds(session.student.id, 'LIVE')
        : null;

    const payload =
      allowedSubjects === null
        ? sessions
        : sessions.map((row) => ({
            ...row,
            hasAccess:
              row.course.type === 'FREE' || allowedSubjects.includes(row.course.subjectId),
          }));

    return NextResponse.json({
      success: true,
      data: { sessions: payload },
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
