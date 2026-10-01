import type { QuizAttemptStatus, QuizGradingPolicy, QuizStatus } from '@prisma/client';

export type QuizStatusCounts = {
  /** number of students the quiz was assigned to */
  assigned: number;
  /** attempts that are still running */
  inProgress: number;
  /** distinct students who have at least one submitted attempt */
  submittedStudents: number;
  /**
   * distinct assigned students who still have something to do: an attempt in
   * flight, or attempts left in their allowance. This is what decides whether
   * the quiz is really finished, because `submittedStudents >= assigned` is not
   * enough when more than one attempt is allowed.
   */
  openStudents: number;
};

export type ResolvableQuiz = {
  status: QuizStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  maxAttempts: number;
};

const TERMINAL_ATTEMPT: QuizAttemptStatus[] = ['SUBMITTED', 'PENDING_REVIEW', 'GRADED'];

/**
 * DRAFT and ARCHIVED are the only states the teacher sets explicitly.
 * Everything else is derived from the time window plus the attempts so that a
 * quiz expires by itself and never needs a background job.
 */
export function resolveQuizStatus(
  quiz: ResolvableQuiz,
  counts: QuizStatusCounts,
  now: Date = new Date(),
): QuizStatus {
  if (quiz.status === 'DRAFT') return 'DRAFT';
  if (quiz.status === 'ARCHIVED') return 'ARCHIVED';

  const windowClosed = Boolean(quiz.closesAt && now.getTime() >= quiz.closesAt.getTime());
  const windowOpen = !quiz.opensAt || now.getTime() >= quiz.opensAt.getTime();

  if (windowClosed) {
    // once the window shuts, finished work reads as COMPLETED, work nobody
    // touched reads as EXPIRED
    return counts.submittedStudents > 0 ? 'COMPLETED' : 'EXPIRED';
  }

  if (!windowOpen) return 'PUBLISHED';

  if (counts.inProgress > 0) return 'IN_PROGRESS';

  // only truly done when nobody assigned still has an attempt left
  if (counts.assigned > 0 && counts.openStudents === 0 && counts.submittedStudents > 0) {
    return 'COMPLETED';
  }

  return 'AVAILABLE';
}

export function quizWindow(quiz: Pick<ResolvableQuiz, 'opensAt' | 'closesAt'>, now = new Date()) {
  return {
    notYetOpen: Boolean(quiz.opensAt && now.getTime() < quiz.opensAt.getTime()),
    closed: Boolean(quiz.closesAt && now.getTime() >= quiz.closesAt.getTime()),
  };
}

/**
 * Server-side authority for "may this student begin another attempt".
 * The UI mirrors this, but the backend is the only thing that matters.
 */
export function canStartAttempt(
  quiz: ResolvableQuiz,
  status: QuizStatus,
  usedAttempts: number,
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (status === 'DRAFT') return { ok: false, reason: 'الاختبار لم يُنشر بعد' };
  if (status === 'ARCHIVED') return { ok: false, reason: 'هذا الاختبار مؤرشف' };

  const window = quizWindow(quiz, now);
  if (window.notYetOpen) return { ok: false, reason: 'لم يبدأ وقت هذا الاختبار بعد' };
  if (window.closed) return { ok: false, reason: 'انتهى وقت هذا الاختبار' };

  // checked before the derived states on purpose: COMPLETED/EXPIRED describe the
  // quiz as a whole, and a student with attempts left must still be able to use
  // them even after everyone else finished.
  if (usedAttempts >= quiz.maxAttempts) {
    return {
      ok: false,
      reason:
        quiz.maxAttempts === 1
          ? 'لا يمكن إعادة محاولة هذا الاختبار'
          : `استنفدت المحاولات المسموحة (${quiz.maxAttempts})`,
    };
  }

  if (status === 'EXPIRED' || status === 'COMPLETED') {
    return { ok: false, reason: 'انتهى هذا الاختبار' };
  }

  return { ok: true };
}

/**
 * The attempt ends at the sooner of its own time limit and the quiz deadline.
 * Returns null for an untimed quiz with no closing date.
 */
export function attemptDeadline(
  quiz: { durationMin: number; closesAt: Date | null },
  startedAt: Date,
): Date | null {
  const candidates: number[] = [];

  if (quiz.durationMin > 0) {
    candidates.push(startedAt.getTime() + quiz.durationMin * 60_000);
  }
  if (quiz.closesAt) {
    candidates.push(quiz.closesAt.getTime());
  }

  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates));
}

export function isAttemptExpired(expiresAt: Date | null, now = new Date()): boolean {
  return Boolean(expiresAt && now.getTime() >= expiresAt.getTime());
}

export type GradeableAttempt = {
  attemptNumber: number;
  percentage: number;
  scorePoints: number;
  status: QuizAttemptStatus;
  requiresManualGrading: boolean;
  submittedAt: Date | null;
};

/**
 * Picks the attempt that counts as the student's official result.
 * Returns the attempt id so callers can flag it as final.
 */
export function selectFinalAttempt<T extends GradeableAttempt>(
  attempts: T[],
  policy: QuizGradingPolicy,
): T | null {
  const finished = attempts.filter(
    (a) => TERMINAL_ATTEMPT.includes(a.status) && !a.requiresManualGrading,
  );
  if (finished.length === 0) return null;

  const sorted = [...finished].sort((a, b) => {
    if (policy === 'LAST_ATTEMPT') return b.attemptNumber - a.attemptNumber;
    if (policy === 'BEST_ATTEMPT') {
      if (b.percentage !== a.percentage) return b.percentage - a.percentage;
      return b.attemptNumber - a.attemptNumber;
    }
    return b.attemptNumber - a.attemptNumber;
  });

  return sorted[0] ?? null;
}

/** Average across graded attempts, used by the AVERAGE policy. */
export function averageScore(attempts: GradeableAttempt[]): number {
  const finished = attempts.filter(
    (a) => TERMINAL_ATTEMPT.includes(a.status) && !a.requiresManualGrading,
  );
  if (finished.length === 0) return 0;

  const total = finished.reduce((sum, a) => sum + a.percentage, 0);
  return round2(total / finished.length);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
