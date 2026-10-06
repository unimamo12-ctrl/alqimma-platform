import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { notFound, requireTeacherOrAdmin, serverError } from '@/lib/auth/guards';

const TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ['LIVE', 'CANCELLED'],
  LIVE: ['ENDED'],
  ENDED: [],
  CANCELLED: ['SCHEDULED'],
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول أولاً' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const liveSession = await prisma.liveSession.findUnique({
      where: { id },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true },
        },
        course: {
select: {
          id: true,
          title: true,
          subjectId: true,
          // FREE courses skip the subscription gate, so the guard below needs it.
            // The published videos are the recording itself. `isRecorded` and
            // `recordingUrl` live on LiveSession, not Course — selecting them
            // here is a hard query error, not a silently empty result.
            videos: {
              where: { isPublished: true },
              select: { id: true, title: true, url: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!liveSession) return notFound('الحصة غير موجودة');

    /*
     * A student may open a session that has not started yet (they are early and
     * want to wait in the room), but only once it is actually LIVE.
     */
    if (session.role === 'STUDENT' && liveSession.status === 'SCHEDULED') {
      return NextResponse.json(
        { success: false, message: 'لم تبدأ الحصة بعد' },
        { status: 403 }
      );
    }

    // No payment gate: any signed-in student may enter any published room. The
    // ownership check below is what keeps one teacher out of another's room.

    if (
      session.role === 'TEACHER' &&
      liveSession.teacherId !== session.teacher?.id
    ) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: { session: liveSession } });
  } catch {
    return serverError();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const { id } = await params;
    const { status } = (await request.json()) as { status?: string };

    if (!status || !(status in TRANSITIONS)) {
      return NextResponse.json(
        { success: false, message: 'حالة غير صالحة' },
        { status: 400 }
      );
    }

    const liveSession = await prisma.liveSession.findUnique({
      where: { id },
      select: { id: true, status: true, teacherId: true },
    });

    if (!liveSession) return notFound('الحصة غير موجودة');

    if (session.role === 'TEACHER' && liveSession.teacherId !== session.teacher?.id) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 403 }
      );
    }

    // ending the session over the socket already flipped the row, so a repeated
    // PATCH to the same status is a harmless no-op rather than a conflict
    if (liveSession.status === status) {
      return NextResponse.json({
        success: true,
        data: { session: liveSession },
      });
    }

    if (!TRANSITIONS[liveSession.status].includes(status)) {
      return NextResponse.json(
        {
          success: false,
          message: `لا يمكن الانتقال من ${liveSession.status} إلى ${status}`,
        },
        { status: 409 }
      );
    }

    const updated = await prisma.liveSession.update({
      where: { id },
      data: {
        status: status as 'LIVE',
        ...(status === 'ENDED' ? { endedAt: new Date() } : {}),
      },
      select: { id: true, status: true, endedAt: true },
    });

    return NextResponse.json({ success: true, data: { session: updated } });
  } catch {
    return serverError();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const { id } = await params;

    const liveSession = await prisma.liveSession.findUnique({
      where: { id },
      select: { id: true, status: true, teacherId: true },
    });

    if (!liveSession) return notFound('الحصة غير موجودة');

    if (session.role === 'TEACHER' && liveSession.teacherId !== session.teacher?.id) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 403 }
      );
    }

    if (liveSession.status === 'LIVE') {
      return NextResponse.json(
        { success: false, message: 'لا يمكن حذف بث مباشر جارٍ' },
        { status: 409 }
      );
    }

    if (liveSession.status === 'ENDED') {
      const attendanceCount = await prisma.attendance.count({ where: { sessionId: id } });

      if (attendanceCount > 0) {
        return NextResponse.json(
          { success: false, message: 'لا يمكن حذف بث له سجل حضور' },
          { status: 409 }
        );
      }
    }

    await prisma.liveSession.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return serverError();
  }
}
