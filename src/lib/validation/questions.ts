export type StoredQuestion = {
  id?: string;
  text?: string;
  options?: unknown;
  correctAnswer?: unknown;
  [key: string]: unknown;
};

export function stripAnswers(questions: unknown): unknown[] {
  if (!Array.isArray(questions)) return [];

  return questions.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;

    const { correctAnswer: _hidden, ...rest } = raw as StoredQuestion;
    void _hidden;
    return rest;
  });
}

export const questionSchema = {
  id: (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null),
  text: (v: unknown) =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : null,
  options: (v: unknown) =>
    Array.isArray(v) && v.length >= 2
      ? v.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      : null,
  correctAnswer: (v: unknown) => (Number.isInteger(v) ? (v as number) : null),
};

export type QuestionValidation = { ok: true } | { ok: false; message: string };

export function validateQuestions(input: unknown): QuestionValidation {
  if (!Array.isArray(input)) return { ok: false, message: 'الأسئلة يجب أن تكون قائمة' };
  if (input.length === 0) return { ok: false, message: 'يجب إضافة سؤال واحد على الأقل' };
  if (input.length > 100) return { ok: false, message: 'الحد الأقصى 100 سؤال' };

  for (const [index, raw] of input.entries()) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, message: `السؤال ${index + 1} غير صالح` };
    }

    const q = raw as Record<string, unknown>;
    const text = questionSchema.text(q.text);
    const options = questionSchema.options(q.options);
    const correctAnswer = questionSchema.correctAnswer(q.correctAnswer);

    if (!text) return { ok: false, message: `نص السؤال ${index + 1} مطلوب` };
    if (!options || options.length < 2) {
      return { ok: false, message: `السؤال ${index + 1} يجب أن يحتوي على خيارين على الأقل` };
    }
    if (correctAnswer === null || correctAnswer < 0 || correctAnswer >= options.length) {
      return { ok: false, message: `الإجابة الصحيحة للسؤال ${index + 1} غير صالحة` };
    }
  }

  return { ok: true };
}
