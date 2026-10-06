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

/**
 * How long before `scheduledAt` a student may enter the waiting room.
 *
 * Must equal the window `server.ts` uses in its `join-session` handler, or the
 * HTTP route and the socket disagree about who may be in the room.
 */
const JOIN_OPENS_BEFORE_MS = 15 * 60 * 1000;

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
     * A student may wait in the room before a broadcast starts, but only from 15
     * minutes before it -- and that rule has to be the *same* rule the socket
     * enforces, because the socket is what actually admits them.
     *
     * These two disagreed. `server.ts` opened the room 15 minutes early and
     * refused with "لم تبدأ الحصة بعد" before that; this route refused every
     * SCHEDULED session outright. So `/api/live` listed a scheduled session with a
     * join button whose HTTP call answered 403, and the student's own socket --
     * which would have let them in -- was never reached. A card offering an action
     * that 403s is exactly the failure this project keeps guarding against, and
     * with payments gone there is no longer any concept of being locked to
     * explain it.
     *
     * `JOIN_OPENS_BEFORE_MS` and `scheduledAt` are therefore the contract; if one
     * side changes, the other has to change with it.
     */
    if (session.role === 'STUDENT' && liveSession.status === 'SCHEDULED') {
      const opensAt = liveSession.scheduledAt.getTime() - JOIN_OPENS_BEFORE_MS;
      if (Date.now() < opensAt) {
        return NextResponse.json(
          { success: false, message: 'لم تبدأ الحصة بعد' },
          { status: 403 }
        );
      }
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
