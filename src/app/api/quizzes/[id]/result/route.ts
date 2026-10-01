import { NextRequest, NextResponse } from 'next/server';
import { requireStudent, isAssignedToStudent, quizErrorResponse } from '@/lib/quiz/access';
import { buildStudentResult, sweepExpiredAttempts } from '@/lib/quiz/service';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/quizzes/[id]/result
 * The student's own result. `breakdown` (with the answer key) only comes back
 * when the teacher enabled reveal AND it cannot leak into a still-open quiz.
 */
export async function GET(_request: NextRequest, { params }: Params) {
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

    await sweepExpiredAttempts(id, studentId);

    const result = await buildStudentResult(id, studentId);
    if (!result) {
      return NextResponse.json(
        { success: false, message: 'الاختبار غير موجود' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return quizErrorResponse(error);
  }
}
