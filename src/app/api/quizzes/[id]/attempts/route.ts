import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireStudent, isAssignedToStudent, quizErrorResponse } from '@/lib/quiz/access';
import { beginAttempt, sweepExpiredAttempts } from '@/lib/quiz/service';
import { toStudentQuestion } from '@/lib/quiz/serialize';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/quizzes/[id]/attempts
 * The only place an attempt row is created. Window, publication state and the
 * attempt limit are all re-validated here; nothing is trusted from the client.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireStudent();
    if (!guard.ok) return guard.response;
    const studentId = guard.session.student.id;

    if (!(await isAssignedToStudent(id, studentId))) {
      return NextResponse.json(
        { success: false, message: 'هذا الاختبار غير مُسند إليك' },
        { status: 403 },
      );
    }

    const { attempt, resumed } = await beginAttempt(id, studentId);

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: true } } },
    });

    if (!quiz) {
      return NextResponse.json(
        { success: false, message: 'الاختبار غير موجود' },
        { status: 404 },
      );
    }

    const saved = Object.fromEntries(
      attempt.answers.map((answer) => [
        answer.questionId,
        {
          selectedOptionId: answer.selectedOptionId,
          textAnswer: answer.textAnswer,
        },
      ]),
    );

    // shuffle only the option list, question identity stays addressable by id
    const questions = quiz.questions.map((question) => {
      const safe = toStudentQuestion(question);
      if (!quiz.shuffleQuestions) return safe;

      return {
        ...safe,
        options: [...safe.options].sort(() => Math.random() - 0.5),
      };
    });

    return NextResponse.json({
      success: true,
      message: resumed ? 'استعدنا محاولتك السابقة' : 'بدأت المحاولة',
      data: {
        attempt: {
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          quizId: quiz.id,
          title: quiz.title,
          durationMin: quiz.durationMin,
          totalPoints: quiz.totalPoints,
          allowNavigation: quiz.allowNavigation,
          showCorrectAnswers: quiz.showCorrectAnswers,
        },
        questions,
        savedAnswers: saved,
      },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}

/** GET closes out anything that timed out before the student sees the list. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const guard = await requireStudent();
    if (!guard.ok) return guard.response;

    const closed = await sweepExpiredAttempts(id, guard.session.student.id);

    return NextResponse.json({
      success: true,
      data: { closedAttempts: closed },
    });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
