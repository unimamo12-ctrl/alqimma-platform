import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import type { TeacherSession } from '@/lib/auth/guards';
import { QuizError } from '@/lib/quiz/service';

export type StudentSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireStudent(): Promise<
  { ok: true; session: StudentSession & { role: 'STUDENT'; student: { id: string } } } | {
    ok: false;
    response: NextResponse;
  }
> {
  const session = await getSession();

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول أولاً' },
        { status: 401 },
      ),
    };
  }

  if (session.role !== 'STUDENT' || !session.student) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'هذه الصفحة مخصصة للتلميذ' },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    session: session as StudentSession & { role: 'STUDENT'; student: { id: string } },
  };
}

/** Teacher/admin may only touch quizzes they own (admins may touch any). */
export async function ownsQuiz(session: TeacherSession, quizId: string): Promise<boolean> {
  if (session.role === 'ADMIN') return true;
  if (!session.teacher) return false;

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, teacherId: session.teacher.id },
    select: { id: true },
  });

  return Boolean(quiz);
}

/** A student may only act on a quiz that was explicitly assigned to them. */
export async function isAssignedToStudent(quizId: string, studentId: string): Promise<boolean> {
  const assignment = await prisma.quizAssignment.findUnique({
    where: { quizId_studentId: { quizId, studentId } },
    select: { id: true },
  });

  return Boolean(assignment);
}

export function quizErrorResponse(error: unknown) {
  if (error instanceof QuizError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  return NextResponse.json(
    { success: false, message: 'حدث خطأ غير متوقع' },
    { status: 500 },
  );
}
