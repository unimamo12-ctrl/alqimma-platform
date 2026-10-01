import { z } from 'zod';
import { MAX_ATTEMPTS_LIMIT, MAX_DURATION_MIN, MAX_OPTIONS, MAX_QUESTIONS } from '@/lib/quiz/constants';

const trimmed = z.string().trim();

/**
 * A picture can only come from our own upload endpoint. Without this check a
 * teacher could point a question at any external URL (a tracking pixel, a
 * hot-linked asset) and every student taking the quiz would fetch it.
 */
const imageField = trimmed
  .max(500, 'رابط الصورة طويل جدًا')
  .refine(
    (value) => !value || /^\/uploads\/image\/[A-Za-z0-9._-]+$/.test(value),
    'رابط الصورة غير صالح',
  )
  .nullable()
  .optional();

const dateField = z
  .string()
  .trim()
  .min(1, 'التاريخ مطلوب')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'تاريخ غير صالح')
  .nullable()
  .optional();

export const optionInputSchema = z.object({
  id: trimmed.min(1).optional(),
  // an option may be a picture on its own, so text is only required without one
  text: trimmed.max(500, 'نص الخيار طويل جدًا').optional().default(''),
  imageUrl: imageField,
  isCorrect: z.boolean().optional().default(false),
});

export const questionInputSchema = z
  .object({
    id: trimmed.min(1).optional(),
    type: z.enum(['MULTIPLE_CHOICE', 'TEXT']),
    // a question may be a picture on its own, so text is only required without one
    text: trimmed.max(2000, 'نص السؤال طويل جدًا').optional().default(''),
    imageUrl: imageField,
    points: z.number().int('النقاط يجب أن تكون رقمًا').min(0).max(1000).default(1),
    isRequired: z.boolean().optional().default(true),
    requiresManualGrading: z.boolean().optional().default(false),
    modelAnswer: trimmed.max(2000).nullable().optional(),
    matchValue: trimmed.max(2000).nullable().optional(),
    matchMode: z.enum(['EXACT', 'CONTAINS']).nullable().optional(),
    options: z.array(optionInputSchema).max(MAX_OPTIONS).optional().default([]),
  })
  .superRefine((question, ctx) => {
    if (!question.text && !question.imageUrl) {
      ctx.addIssue({
        code: 'custom',
        message: 'السؤال يحتاج نصًا أو صورة',
        path: ['text'],
      });
    }

    if (question.type === 'MULTIPLE_CHOICE') {
      if (question.options.length < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'سؤال الاختيار من متعدد يحتاج خيارين على الأقل',
          path: ['options'],
        });
      }
      question.options.forEach((option, optionIndex) => {
        if (!option.text && !option.imageUrl) {
          ctx.addIssue({
            code: 'custom',
            message: `الخيار ${optionIndex + 1} يحتاج نصًا أو صورة`,
            path: ['options', optionIndex, 'text'],
          });
        }
      });
      const correct = question.options.filter((o) => o.isCorrect).length;
      if (correct === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'يجب تحديد الإجابة الصحيحة',
          path: ['options'],
        });
      }
      if (correct > 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'يسمح بإجابة صحيحة واحدة فقط لكل سؤال اختيار',
          path: ['options'],
        });
      }
    }

    if (question.type === 'TEXT') {
      if (question.options.length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'السؤال النصي لا يقبل خيارات',
          path: ['options'],
        });
      }
      // a text question is either auto-gradable (needs a match value, which is
      // what actually decides correct/wrong) or left to a human reader; a
      // model answer alone cannot grade anything, so it is not a substitute
      if (!question.matchValue && !question.requiresManualGrading) {
        ctx.addIssue({
          code: 'custom',
          message: 'السؤال النصي يحتاج إجابة نموذجية للمقارنة، أو تفعيل التصحيح اليدوي',
          path: ['matchValue'],
        });
      }
    }
  });

export const quizSettingsSchema = z.object({
  title: trimmed.min(1, 'العنوان مطلوب').max(200, 'العنوان طويل جدًا'),
  description: trimmed.max(2000).nullable().optional(),
  durationMin: z
    .number()
    .int('المدة يجب أن تكون رقمًا')
    .min(0, 'المدة لا يمكن أن تكون سالبة')
    .max(MAX_DURATION_MIN, `الحد الأقصى ${MAX_DURATION_MIN} دقيقة`)
    .default(0),
  maxAttempts: z
    .number()
    .int('عدد المحاولات يجب أن يكون رقمًا')
    .min(1, 'مسموح محاولة واحدة على الأقل')
    .max(MAX_ATTEMPTS_LIMIT, `الحد الأقصى ${MAX_ATTEMPTS_LIMIT} محاولات`)
    .default(1),
  gradingPolicy: z.enum(['LAST_ATTEMPT', 'BEST_ATTEMPT', 'AVERAGE']).default('LAST_ATTEMPT'),
  allowNavigation: z.boolean().default(true),
  shuffleQuestions: z.boolean().default(false),
  showCorrectAnswers: z.boolean().default(false),
  opensAt: dateField,
  closesAt: dateField,
});

export const quizDraftSchema = z.object({
  courseId: trimmed.min(1, 'الدورة مطلوبة'),
  ...quizSettingsSchema.shape,
  questions: z.array(questionInputSchema).min(1, 'أضف سؤالًا واحدًا على الأقل').max(MAX_QUESTIONS),
});

export type QuizDraftInput = z.infer<typeof quizDraftSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; issues: string[] };

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const issues = result.error.issues.map((issue) => issue.message);

  return {
    ok: false,
    message: issues[0] ?? 'بيانات غير صالحة',
    issues,
  };
}

/** Cross-field rules that zod cannot express on a single object. */
export function validateWindow(
  settings: { opensAt?: string | null; closesAt?: string | null },
): string | null {
  if (!settings.opensAt || !settings.closesAt) return null;

  const opensAt = Date.parse(settings.opensAt);
  const closesAt = Date.parse(settings.closesAt);

  if (closesAt <= opensAt) {
    return 'وقت الانتهاء يجب أن يكون بعد وقت البداية';
  }

  return null;
}

export function totalPoints(questions: { points: number }[]): number {
  return questions.reduce((sum, question) => sum + question.points, 0);
}
