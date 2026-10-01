import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';

const JOIN_WINDOW_MINUTES = 15;
const LATE_GRACE_MINUTES = 15;

function unauthorized(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) return unauthorized('يجب تسجيل الدخول أولاً', 401);

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (session.role === 'STUDENT') {
      if (!session.student) return unauthorized('لا يوجد ملف طالب', 403);

      const attendance = await prisma.attendance.findMany({
        where: {
          studentId: session.student.id,
          ...(sessionId && { sessionId }),
        },
        include: {
          session: {
            select: { id: true, title: true, scheduledAt: true },
          },
        },
        orderBy: { joinTime: 'desc' },
      });

      return NextResponse.json({ success: true, data: { attendance } });
    }

    if (session.role === 'TEACHER' || session.role === 'ADMIN') {
      const where: Record<string, unknown> = {};

      if (sessionId) {
        const live = await prisma.liveSession.findUnique({
          where: { id: sessionId },
          select: { id: true, teacherId: true },
        });

        if (!live) return unauthorized('الحصة غير موجودة', 404);

        if (session.role === 'TEACHER' && live.teacherId !== session.teacher?.id) {
          return unauthorized('غير مصرح بعرض حضور هذه الحصة', 403);
        }

        where.sessionId = sessionId;
      } else if (session.role === 'TEACHER') {
        if (!session.teacher) return unauthorized('لا يوجد ملف أستاذ', 403);
        where.session = { teacherId: session.teacher.id };
      }

      const attendance = await prisma.attendance.findMany({
        where,
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          session: {
            select: { id: true, title: true, scheduledAt: true },
          },
        },
        orderBy: { joinTime: 'desc' },
      });

      return NextResponse.json({ success: true, data: { attendance } });
    }

    return unauthorized('غير مصرح', 403);
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) return unauthorized('يجب تسجيل الدخول أولاً', 401);
    if (session.role !== 'STUDENT') return unauthorized('هذه العملية للطلاب فقط', 403);
    if (!session.student) return unauthorized('لا يوجد ملف طالب', 403);

    const body = await request.json();
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const action = body.action;

    if (!sessionId || (action !== 'join' && action !== 'leave')) {
      return unauthorized('طلب غير صالح', 400);
    }

    const live = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, scheduledAt: true, endedAt: true },
    });

    if (!live) return unauthorized('الحصة غير موجودة', 404);
    if (live.status === 'CANCELLED') return unauthorized('تم إلغاء هذه الحصة', 400);
    if (live.status === 'ENDED' || live.endedAt) {
      return unauthorized('انتهت هذه الحصة', 400);
    }

    if (action === 'join') {
      const now = Date.now();
      const opensAt = live.scheduledAt.getTime() - JOIN_WINDOW_MINUTES * 60 * 1000;
      const closesAt = live.scheduledAt.getTime() + LATE_GRACE_MINUTES * 60 * 1000;

      if (now < opensAt) {
        return unauthorized(
          `لا يمكن تسجيل الحضور قبل ${new Date(opensAt).toLocaleString('ar-DZ')}`,
          400,
        );
      }

      if (now > closesAt) {
        return unauthorized('انتهت مدة تسجيل الحضور لهذه الحصة', 400);
      }

      const existing = await prisma.attendance.findUnique({
        where: { sessionId_studentId: { sessionId, studentId: session.student.id } },
      });

      if (existing) {
        return unauthorized('لقد سجلت حضورك بالفعل في هذه الحصة', 400);
      }

      const attendance = await prisma.attendance.create({
        data: { sessionId, studentId: session.student.id, joinTime: new Date() },
      });

      return NextResponse.json({ success: true, data: { attendance } });
    }

    const attendance = await prisma.attendance.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: session.student.id } },
    });

    if (!attendance) return unauthorized('لم تسجل حضورك في هذه الحصة', 404);
    if (attendance.leaveTime) return unauthorized('تم تسجيل خروجك بالفعل', 400);

    const leaveTime = new Date();
    const duration = Math.max(
      0,
      Math.floor((leaveTime.getTime() - attendance.joinTime.getTime()) / 60000),
    );

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { leaveTime, duration },
    });

    return NextResponse.json({ success: true, data: { attendance: updated } });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}
