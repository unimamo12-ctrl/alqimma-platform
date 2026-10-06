import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { requireTeacherOrAdmin } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');

    const session = await getSession();
    const isAdmin = session?.role === 'ADMIN';
    const ownTeacherId = session?.role === 'TEACHER' ? session.teacher?.id : undefined;

    const where: Prisma.CourseWhereInput = {};
    if (ownTeacherId) where.teacherId = ownTeacherId;
    if (!isAdmin && !ownTeacherId) where.isPublished = true;

    if (teacherId && (isAdmin || teacherId === ownTeacherId)) {
      where.teacherId = teacherId;
    }

    const courses = await prisma.course.findMany({
      where,
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        subject: { select: { id: true, name: true, nameAr: true } },
        level: { select: { id: true, name: true } },
        _count: {
          select: {
            videos: true,
            files: true,
            // the teacher's course list states what each course actually holds
            exercises: true,
            liveSessions: true,
            enrollments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: { courses },
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
    const { subjectId, levelId, title, description, thumbnail, teacherId, isPublished } = body;

    if (!subjectId || !levelId || !title) {
      return NextResponse.json(
        { success: false, message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' },
        { status: 400 }
      );
    }

    // `type` (FREE/PAID) and `price` were accepted here and meant nothing beyond
    // gating access. Both are gone from the schema, and the validation that
    // rejected a bad value went with them -- a client still sending `type: 'PAID'`
    // now has it ignored rather than rejected, which is the intended outcome for
    // a field that no longer has a meaning.

    const ownerTeacherId = session.role === 'ADMIN' ? teacherId : session.teacher?.id;

    if (!ownerTeacherId) {
      return NextResponse.json(
        { success: false, message: 'يجب تحديد الأستاذ المسؤول عن الدورة' },
        { status: 400 }
      );
    }

    if (session.role === 'ADMIN' && teacherId !== undefined && teacherId !== session.teacher?.id) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: ownerTeacherId },
        select: { id: true },
      });

      if (!teacher) {
        return NextResponse.json(
          { success: false, message: 'الأستاذ المحدد غير موجود' },
          { status: 400 }
        );
      }
    }

    const course = await prisma.course.create({
      data: {
        teacherId: ownerTeacherId,
        subjectId,
        levelId,
        title,
        description,
        thumbnail,
        isPublished: isPublished === true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { course },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
