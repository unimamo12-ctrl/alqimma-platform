import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTeacherOrAdmin, notFound } from '@/lib/auth/guards';
import { ownsQuiz, quizErrorResponse } from '@/lib/quiz/access';
import { effectiveStatus, getQuiz } from '@/lib/quiz/service';
import { averageScore, selectFinalAttempt } from '@/lib/quiz/status';
import { toAttemptSummary, toGradedQuestion } from '@/lib/quiz/serialize';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/quizzes/[id]/results
 * One row per assigned student: status, attempts used, correct/wrong/unanswered,
 * points, percentage and elapsed time. `?studentId=` returns that student's full
 * per-question detail across every attempt.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;
    const { session } = guard;

    if (!(await ownsQuiz(session, id))) return notFound('الاختبار غير موجود');

    const quiz = await getQuiz(id);
    if (!quiz) return notFound('الاختبار غير موجود');

    const status = await effectiveStatus(id);

    const assignments = await prisma.quizAssignment.findMany({
      where: { quizId: id },
      select: {
        student: {
          select: { id: true, firstName: true, lastName: true, user: { select: { email: true } } },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });

    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: id },
      include: { answers: true },
      orderBy: { attemptNumber: 'asc' },
    });

    // detail view for a single student inside this quiz
    if (studentId) {
      const student = assignments.find((a) => a.student.id === studentId);
      if (!student) return notFound('هذا التلميذ غير مُسند إليه الاختبار');

      const studentAttempts = attempts.filter((attempt) => attempt.studentId === studentId);
      const finalAttempt = selectFinalAttempt(studentAttempts, quiz.gradingPolicy);

      return NextResponse.json({
        success: true,
        data: {
          quiz: {
            id: quiz.id,
            title: quiz.title,
            status,
            totalPoints: quiz.totalPoints,
            maxAttempts: quiz.maxAttempts,
            gradingPolicy: quiz.gradingPolicy,
          },
          student: {
            id: student.student.id,
            name: `${student.student.firstName} ${student.student.lastName}`,
            email: student.student.user.email,
          },
          attempts: studentAttempts.map((attempt) => ({
            ...toAttemptSummary(attempt),
            isFinal: finalAttempt?.id === attempt.id,
            // the teacher always sees the full breakdown, answer key included
            breakdown: quiz.questions.map((question) =>
              toGradedQuestion(
                question,
                attempt.answers.filter((answer) => answer.questionId === question.id),
                true,
              ),
            ),
          })),
          averagePercentage: averageScore(studentAttempts),
        },
      });
    }

    const rows = assignments.map(({ student }) => {
      const studentAttempts = attempts.filter((attempt) => attempt.studentId === student.id);
      const finalAttempt = selectFinalAttempt(studentAttempts, quiz.gradingPolicy);
      const pendingReview = studentAttempts.filter((a) => a.status === 'PENDING_REVIEW').length;
      const openAttempt = studentAttempts.some((a) => a.status === 'IN_PROGRESS');

      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.user.email,
        attemptsUsed: studentAttempts.length,
        attemptsRemaining: Math.max(0, quiz.maxAttempts - studentAttempts.length),
        state: openAttempt
          ? 'IN_PROGRESS'
          : pendingReview > 0
            ? 'PENDING_REVIEW'
            : finalAttempt
              ? 'COMPLETED'
              : 'NOT_STARTED',
        finalAttemptId: finalAttempt?.id ?? null,
        correctCount: finalAttempt?.correctCount ?? 0,
        wrongCount: finalAttempt?.wrongCount ?? 0,
        unansweredCount: finalAttempt?.unansweredCount ?? 0,
        scorePoints: finalAttempt?.scorePoints ?? 0,
        maxPoints: quiz.totalPoints,
        percentage: finalAttempt?.percentage ?? 0,
        durationSec: finalAttempt?.durationSec ?? 0,
        averagePercentage: averageScore(studentAttempts),
      };
    });

    const graded = rows.filter((row) => row.state === 'COMPLETED');

    return NextResponse.json({
      success: true,
      data: {
        quiz: {
          id: quiz.id,
          title: quiz.title,
          status,
          totalPoints: quiz.totalPoints,
          maxAttempts: quiz.maxAttempts,
          gradingPolicy: quiz.gradingPolicy,
          questionCount: quiz.questions.length,
        },
        summary: {
          assigned: rows.length,
          completed: graded.length,
          inProgress: rows.filter((r) => r.state === 'IN_PROGRESS').length,
          pendingReview: rows.filter((r) => r.state === 'PENDING_REVIEW').length,
          notStarted: rows.filter((r) => r.state === 'NOT_STARTED').length,
          averagePercentage:
            graded.length > 0
              ? Math.round((graded.reduce((s, r) => s + r.percentage, 0) / graded.length) * 100) / 100
              : 0,
          highestPercentage: graded.length
            ? Math.max(...graded.map((r) => r.percentage))
            : 0,
        },
        rows,
      },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
