import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import {
  requireTeacherOrAdmin,
  notFound,
  serverError,
} from '@/lib/auth/guards';
import { isAssignedToStudent, ownsQuiz, quizErrorResponse, requireStudent } from '@/lib/quiz/access';
import { effectiveStatus, getQuiz } from '@/lib/quiz/service';
import { toStudentQuestion, toTeacherQuestion } from '@/lib/quiz/serialize';
import { assertNoAttemptsStarted, writeQuizDraft } from '@/lib/quiz/writer';
import { parseBody, quizDraftSchema, validateWindow } from '@/lib/validation/quiz';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول أولاً' },
        { status: 401 },
      );
    }

    if (session.role === 'STUDENT') {
      const guard = await requireStudent();
      if (!guard.ok) return guard.response;

      if (!(await isAssignedToStudent(id, guard.session.student.id))) {
        return notFound('الاختبار غير موجود');
      }

      const quiz = await getQuiz(id);
      if (!quiz) return notFound('الاختبار غير موجود');

      const status = await effectiveStatus(id);

      // a draft is invisible to students no matter what
      if (status === 'DRAFT' || status === 'ARCHIVED') {
        return notFound('الاختبار غير متاح');
      }

      return NextResponse.json({
        success: true,
        data: {
          quiz: {
            id: quiz.id,
            title: quiz.title,
            description: quiz.description,
            status,
            durationMin: quiz.durationMin,
            maxAttempts: quiz.maxAttempts,
            totalPoints: quiz.totalPoints,
            gradingPolicy: quiz.gradingPolicy,
            allowNavigation: quiz.allowNavigation,
            shuffleQuestions: quiz.shuffleQuestions,
            opensAt: quiz.opensAt,
            closesAt: quiz.closesAt,
            course: quiz.course,
            // answer key never crosses this boundary
            questions: quiz.questions.map(toStudentQuestion),
          },
        },
      });
    }

    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;

    if (!(await ownsQuiz(guard.session, id))) {
      return notFound('الاختبار غير موجود');
    }

    const quiz = await getQuiz(id);
    if (!quiz) return notFound('الاختبار غير موجود');

    const status = await effectiveStatus(id);
    const assignments = await prisma.quizAssignment.findMany({
      where: { quizId: id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            user: { select: { email: true } },
          },
        },
      },
    });

    const [attemptCount, pendingReviewCount] = await Promise.all([
      prisma.quizAttempt.count({ where: { quizId: id } }),
      prisma.quizAttempt.count({ where: { quizId: id, status: 'PENDING_REVIEW' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        quiz: {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          status,
          storedStatus: quiz.status,
          totalPoints: quiz.totalPoints,
          durationMin: quiz.durationMin,
          maxAttempts: quiz.maxAttempts,
          gradingPolicy: quiz.gradingPolicy,
          allowNavigation: quiz.allowNavigation,
          shuffleQuestions: quiz.shuffleQuestions,
          showCorrectAnswers: quiz.showCorrectAnswers,
          opensAt: quiz.opensAt,
          closesAt: quiz.closesAt,
          publishedAt: quiz.publishedAt,
          archivedAt: quiz.archivedAt,
          createdAt: quiz.createdAt,
          attemptCount,
          pendingReviewCount,
          course: quiz.course,
          // full answer key for the owner only
          questions: quiz.questions.map(toTeacherQuestion),
          students: assignments.map((assignment) => ({
            id: assignment.student.id,
            name: `${assignment.student.firstName} ${assignment.student.lastName}`,
            email: assignment.student.user.email,
          })),
        },
      },
    });
  } catch {
    return serverError();
  }
}

/**
 * PUT /api/quizzes/[id]
 * Questions and settings stay editable after publishing. The quiz is frozen
 * only once an attempt exists, so historic results stay comparable.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!session.teacher) {
      return NextResponse.json(
        { success: false, message: 'لا يوجد ملف أستاذ' },
        { status: 403 },
      );
    }

    if (!(await ownsQuiz(session, id))) return notFound('الاختبار غير موجود');

    const existing = await getQuiz(id);
    if (!existing) return notFound('الاختبار غير موجود');

    if (existing.status === 'ARCHIVED') {
      return NextResponse.json(
        { success: false, message: 'لا يمكن تعديل اختبار مؤرشف' },
        { status: 409 },
      );
    }

    const body = await request.json();
    const parsed = parseBody(quizDraftSchema, body);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, message: parsed.message, issues: parsed.issues },
        { status: 400 },
      );
    }

    const windowError = validateWindow(parsed.data);
    if (windowError) {
      return NextResponse.json({ success: false, message: windowError }, { status: 400 });
    }

    const published = existing.status !== 'DRAFT';

    // Publication alone does not freeze a quiz: it stays editable until the
    // first attempt exists, so a teacher can still fix a missing question after
    // handing the quiz out.
    await assertNoAttemptsStarted(id);

    const quiz = await writeQuizDraft(id, parsed.data, {
      teacherId: existing.teacherId,
      studentIds: body.studentIds ?? [],
      courseWide: body.courseWide === true,
    });

    return NextResponse.json({
      success: true,
      message: published ? 'تم تحديث الاختبار' : 'تم حفظ المسودة',
      data: { quiz },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}

/** DELETE only removes a draft; anything students could have seen is archived. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!(await ownsQuiz(session, id))) return notFound('الاختبار غير موجود');

    const existing = await getQuiz(id);
    if (!existing) return notFound('الاختبار غير موجود');

    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        {
          success: false,
          message: 'لا يمكن حذف اختبار منشور. استخدم الأرشفة للحفاظ على نتائج التلاميذ.',
        },
        { status: 409 },
      );
    }

    /*
     * The quiz and the notifications that point at it go together.
     *
     * Publishing writes a notification per assigned student linking to
     * `/student/quizzes/<id>`. Deleting only the quiz left those links in place,
     * so the notifications page offered dead links that 404 on click — the rows
     * are the only record that the target ever existed, so nothing else would
     * ever have told a student to stop following one.
     */
    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: { OR: [{ link: `/student/quizzes/${id}` }, { link: `/teacher/quizzes/${id}` }] },
      }),
      prisma.quiz.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true, message: 'تم حذف المسودة' });
  } catch {
    return serverError();
  }
}
