export const QUIZ_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  AVAILABLE: 'متاح',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  EXPIRED: 'منتهي',
  ARCHIVED: 'مؤرشف',
};

export const ATTEMPT_LABELS: Record<string, string> = {
  IN_PROGRESS: 'جارية',
  SUBMITTED: 'مُسلّمة',
  PENDING_REVIEW: 'بانتظار التصحيح',
  GRADED: 'مصحّحة',
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: 'اختيار من متعدد',
  TEXT: 'إجابة نصية',
};

export const GRADING_POLICY_LABELS: Record<string, string> = {
  LAST_ATTEMPT: 'آخر محاولة',
  BEST_ATTEMPT: 'أعلى نتيجة',
  AVERAGE: 'متوسط المحاولات',
};

export const QUIZ_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'AVAILABLE',
  'IN_PROGRESS',
  'COMPLETED',
  'EXPIRED',
  'ARCHIVED',
] as const;

export type QuizStatusName = (typeof QUIZ_STATUSES)[number];

export const MAX_QUESTIONS = 100;
export const MAX_OPTIONS = 8;
export const MAX_ATTEMPTS_LIMIT = 10;
export const MAX_DURATION_MIN = 600;

/** STATUSES a student may still be blocked by, used for empty-state copy. */
export const isTerminalStatus = (status: string) =>
  status === 'EXPIRED' || status === 'ARCHIVED';
