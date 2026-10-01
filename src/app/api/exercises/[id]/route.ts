import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { stripAnswers, validateQuestions } from '@/lib/validation/questions';
import {
  requireTeacherOrAdmin,
  ownsCourse,
  notFound,
  serverError,
} from '@/lib/auth/guards';
import { requireCourseAccess } from '@/lib/subscriptions/access';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const exercise = await prisma.exercise.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            isPublished: true,
teacherId: true,
      subjectId: true,
      // FREE courses skip the subscription gate, so the guard below needs it.
      type: true,
      subject: { select: { name: true } },
      level: { select: { name: true } },
          },
        },
      },
    });

    if (!exercise) return notFound('التمرين غير موجود');

    const session = await getSession();
    const isOwner =
      session?.role === 'ADMIN' ||
      (session?.role === 'TEACHER' && session.teacher?.id === exercise.course.teacherId);

    if (!isOwner && !exercise.course.isPublished) {
      return notFound('التمرين غير موجود');
    }

    // A FREE course is open to any student; a PAID one needs an active EXERCISE
    // subscription for its subject. This is also the gate that keeps the answer
    // key away from a student who has only bought live access.
    if (session?.role === 'STUDENT') {
      const access = await requireCourseAccess(
        session.student?.id ?? null,
        exercise.course.subjectId,
        'EXERCISE',
        exercise.course.type,
      );
      if (!access.ok) return access.response;
    }

    return NextResponse.json({
      success: true,
      data: {
        exercise: {
          ...exercise,
          questions: isOwner ? exercise.questions : stripAnswers(exercise.questions),
        },
      },
    });
  } catch {
    return serverError();
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const { id } = await params;

    const exercise = await prisma.exercise.findUnique({
      where: { id },
      select: { id: true, courseId: true },
    });

    if (!exercise) return notFound('التمرين غير موجود');

    if (!(await ownsCourse(session, exercise.courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بتعديل هذا التمرين' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : undefined;
    const description =
      typeof body.description === 'string' ? body.description.trim() : undefined;

    if (title !== undefined && !title) {
      return NextResponse.json(
        { success: false, message: 'العنوان مطلوب' },
        { status: 400 },
      );
    }

    if (Array.isArray(body.questions)) {
      const check = validateQuestions(body.questions);
      if (!check.ok) {
        return NextResponse.json(
          { success: false, message: check.message },
          { status: 400 },
        );
      }
    }

    if (body.duration !== undefined && (!Number.isInteger(body.duration) || body.duration < 0)) {
      return NextResponse.json(
        { success: false, message: 'المدة غير صالحة' },
        { status: 400 },
      );
    }

    const updated = await prisma.exercise.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(Array.isArray(body.questions) ? { questions: body.questions } : {}),
        ...(typeof body.duration === 'number' ? { duration: body.duration } : {}),
      },
    });

    return NextResponse.json({ success: true, data: { exercise: updated } });
  } catch {
    return serverError();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const { id } = await params;

    const exercise = await prisma.exercise.findUnique({
      where: { id },
      select: { id: true, courseId: true },
    });

    if (!exercise) return notFound('التمرين غير موجود');

    if (!(await ownsCourse(session, exercise.courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بحذف هذا التمرين' },
        { status: 403 },
      );
    }

    await prisma.exercise.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return serverError();
  }
}
