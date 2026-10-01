import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { requireTeacherOrAdmin, ownsCourse } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');
    const courseId = searchParams.get('courseId');

    const where: Prisma.FileWhereInput = { isPublished: true };
    if (courseId) where.courseId = courseId;

    const session = await getSession();
    const isAdmin = session?.role === 'ADMIN';
    const ownTeacherId = session?.role === 'TEACHER' ? session.teacher?.id : undefined;

    if (isAdmin || ownTeacherId) {
      delete where.isPublished;
    }

    const courseFilter: Prisma.CourseWhereInput = {};
    if (ownTeacherId) courseFilter.teacherId = ownTeacherId;
    if (!isAdmin && !ownTeacherId) courseFilter.isPublished = true;

    if (teacherId && (isAdmin || teacherId === ownTeacherId)) {
      courseFilter.teacherId = teacherId;
    }

    if (Object.keys(courseFilter).length > 0) {
      where.course = courseFilter;
    }


    const files = await prisma.file.findMany({
      where,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            subject: { select: { name: true } },
            level: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: { files },
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
    const { courseId, name, description, url, fileType, size } = body;

    if (!courseId || !name || !url || !fileType) {
      return NextResponse.json(
        { success: false, message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' },
        { status: 400 }
      );
    }

    if (!(await ownsCourse(session, courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بإضافة ملف لهذه الدورة' },
        { status: 403 }
      );
    }

    const file = await prisma.file.create({
      data: {
        courseId,
        name,
        description,
        url,
        fileType,
        size: size || 0,
        isPublished: true,
      },
      include: {
        course: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: { file },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
