import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { requireTeacherOrAdmin, ownsCourse } from '@/lib/auth/guards';
import { quizErrorResponse, requireStudent } from '@/lib/quiz/access';
import { effectiveStatus } from '@/lib/quiz/service';
import { parseBody, quizDraftSchema, validateWindow } from '@/lib/validation/quiz';
import { writeQuizDraft } from '@/lib/quiz/writer';

/**
 * GET /api/quizzes
 *  - teacher/admin: every quiz they own, with the derived lifecycle status
 *  - student: only quizzes explicitly assigned to them
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
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

      const assignments = await prisma.quizAssignment.findMany({
        where: { studentId: guard.session.student.id, ...(courseId ? { quiz: { courseId } } : {}) },
        include: {
          quiz: {
            include: {
              course: { select: { id: true, title: true } },
              _count: { select: { questions: true, assignments: true } },
            },
          },
        },
        orderBy: { assignedAt: 'desc' },
      });

      const quizzes = [];
      for (const assignment of assignments) {
        // a draft or an archived quiz must never surface in the student's list;
        // only the student's own attempts keep a finished quiz reachable
        if (assignment.quiz.status === 'DRAFT' || assignment.quiz.status === 'ARCHIVED') {
          continue;
        }

        const status = await effectiveStatus(assignment.quizId);
        const attempts = await prisma.quizAttempt.findMany({
          where: { quizId: assignment.quizId, studentId: guard.session.student.id },
          orderBy: { attemptNumber: 'asc' },
        });

        quizzes.push({
          id: assignment.quiz.id,
          title: assignment.quiz.title,
          description: assignment.quiz.description,
          status,
          durationMin: assignment.quiz.durationMin,
          maxAttempts: assignment.quiz.maxAttempts,
          gradingPolicy: assignment.quiz.gradingPolicy,
          showCorrectAnswers: assignment.quiz.showCorrectAnswers,
          totalPoints: assignment.quiz.totalPoints,
          questionCount: assignment.quiz._count.questions,
          opensAt: assignment.quiz.opensAt,
          closesAt: assignment.quiz.closesAt,
          assignedAt: assignment.assignedAt,
          course: assignment.quiz.course,
          attemptsUsed: attempts.length,
          attemptsRemaining: Math.max(0, assignment.quiz.maxAttempts - attempts.length),
          // enough for the list UI to decide what to offer, never the answers
          hasOpenAttempt: attempts.some((attempt) => attempt.status === 'IN_PROGRESS'),
          openAttemptId: attempts.find((attempt) => attempt.status === 'IN_PROGRESS')?.id ?? null,
        });
      }

      return NextResponse.json({ success: true, data: { quizzes } });
    }

    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;

    const quizzes = await prisma.quiz.findMany({
      where: {
        ...(session.role === 'ADMIN' ? {} : { teacherId: session.teacher?.id ?? '' }),
        ...(courseId ? { courseId } : {}),
      },
      include: {
        course: { select: { id: true, title: true } },
        _count: { select: { questions: true, assignments: true, attempts: true } },
        assignments: {
          select: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const payload = [];
    for (const quiz of quizzes) {
      const status = await effectiveStatus(quiz.id);
      const pendingReview = await prisma.quizAttempt.count({
        where: { quizId: quiz.id, status: 'PENDING_REVIEW' },
      });

      payload.push({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        status,
        storedStatus: quiz.status,
        totalPoints: quiz.totalPoints,
        durationMin: quiz.durationMin,
        maxAttempts: quiz.maxAttempts,
        gradingPolicy: quiz.gradingPolicy,
        showCorrectAnswers: quiz.showCorrectAnswers,
        allowNavigation: quiz.allowNavigation,
        shuffleQuestions: quiz.shuffleQuestions,
        opensAt: quiz.opensAt,
        closesAt: quiz.closesAt,
        publishedAt: quiz.publishedAt,
        archivedAt: quiz.archivedAt,
        createdAt: quiz.createdAt,
        course: quiz.course,
        questionCount: quiz._count.questions,
        assignedCount: quiz._count.assignments,
        attemptCount: quiz._count.attempts,
        pendingReviewCount: pendingReview,
        students: quiz.assignments.map((assignment) => ({
          id: assignment.student.id,
          name: `${assignment.student.firstName} ${assignment.student.lastName}`,
          email: assignment.student.user.email,
        })),
      });
    }

    return NextResponse.json({ success: true, data: { quizzes: payload } });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}

/** POST /api/quizzes — always creates a DRAFT. Publishing is a separate step. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!session.teacher) {
      return NextResponse.json(
        { success: false, message: 'لا يوجد ملف أستاذ' },
        { status: 403 },
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

    if (!(await ownsCourse(session, parsed.data.courseId))) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح بإنشاء اختبار لهذه الدورة' },
        { status: 403 },
      );
    }

    const quiz = await writeQuizDraft(null, parsed.data, {
      teacherId: session.teacher.id,
      studentIds: body.studentIds ?? [],
      courseWide: body.courseWide === true,
    });

    return NextResponse.json({
      success: true,
      message: 'تم حفظ الاختبار كمسودة',
      data: { quiz },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
