import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { stripAnswers, validateQuestions } from '@/lib/validation/questions';
import { requireTeacherOrAdmin, ownsCourse } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');
    const courseId = searchParams.get('courseId');

    const where: Prisma.ExerciseWhereInput = {};
    if (courseId) where.courseId = courseId;

    const session = await getSession();
    const isAdmin = session?.role === 'ADMIN';
    const ownTeacherId = session?.role === 'TEACHER' ? session.teacher?.id : undefined;

    const courseFilter: Prisma.CourseWhereInput = {};
    if (ownTeacherId) courseFilter.teacherId = ownTeacherId;
    if (!isAdmin && !ownTeacherId) courseFilter.isPublished = true;

// No payment filter for a student: the published-course check above is the only
    // restriction.

    if (teacherId && (isAdmin || teacherId === ownTeacherId)) {
      courseFilter.teacherId = teacherId;
    }

    if (Object.keys(courseFilter).length > 0) {
      where.course = courseFilter;
    }

    const exercises = await prisma.exercise.findMany({
      where,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            teacherId: true,
            subject: { select: { name: true } },
            level: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        exercises: exercises.map((exercise) => {
          const canSeeAnswers = isAdmin || exercise.course.teacherId === ownTeacherId;
          return {
            ...exercise,
            questions: canSeeAnswers
              ? exercise.questions
              : stripAnswers(exercise.questions),
          };
        }),
      },
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
    const { courseId, title, description, questions, duration } = body;

    if (!courseId || !title) {
      return NextResponse.json(
        { success: false, message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' },
        { status: 400 }
      );
    }

    const check = validateQuestions(questions ?? []);
    if (!check.ok) {
      return NextResponse.json(
        { success: false, message: check.message },
        { status: 400 }
      );
    }

    if (duration !== undefined && (!Number.isInteger(duration) || duration < 0)) {
      return NextResponse.json(
        { success: false, message: 'المدة غير صالحة' },
        { status: 400 }
      );
    }

    if (!(await ownsCourse(session, courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بإضافة تمرين لهذه الدورة' },
        { status: 403 }
      );
    }

    const exercise = await prisma.exercise.create({
      data: {
        courseId,
        title,
        description,
        questions: questions || [],
        duration: duration || 0,
      },
      include: {
        course: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: { exercise },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
