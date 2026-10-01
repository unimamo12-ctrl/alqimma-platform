import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { NextResponse } from 'next/server';

export type TeacherSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export type GuardResult =
  | { ok: true; session: TeacherSession }
  | { ok: false; response: NextResponse };

export async function requireTeacherOrAdmin(): Promise<GuardResult> {
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

  if (session.role !== 'TEACHER' && session.role !== 'ADMIN') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, session };
}

export async function ownsCourse(
  session: TeacherSession,
  courseId: string,
): Promise<boolean> {
  if (session.role === 'ADMIN') return true;

  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId: session.teacher?.id },
    select: { id: true },
  });

  return Boolean(course);
}

export function notFound(message = 'العنصر غير موجود'): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 404 });
}

export function serverError(): NextResponse {
  return NextResponse.json(
    { success: false, message: 'حدث خطأ غير متوقع' },
    { status: 500 },
  );
}
