'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApiData } from '@/lib/hooks/use-api';
import type {
  CandidateStudent,
  GradingPolicy,
  TeacherQuestion,
  TeacherQuizDetail,
} from '@/lib/quiz/types';

export type OptionDraft = { id?: string; text: string; imageUrl: string; isCorrect: boolean };

export type QuestionDraft = {
  id?: string;
  type: 'MULTIPLE_CHOICE' | 'TEXT';
  text: string;
  imageUrl: string;
  points: number;
  isRequired: boolean;
  requiresManualGrading: boolean;
  modelAnswer: string;
  matchValue: string;
  matchMode: 'EXACT' | 'CONTAINS';
  options: OptionDraft[];
};

export type QuizForm = {
  courseId: string;
  title: string;
  description: string;
  durationMin: number;
  maxAttempts: number;
  gradingPolicy: GradingPolicy;
  allowNavigation: boolean;
  shuffleQuestions: boolean;
  showCorrectAnswers: boolean;
  opensAt: string;
  closesAt: string;
};

export type SaveResponse = { id: string; title: string };

const blankQuestion = (): QuestionDraft => ({
  type: 'MULTIPLE_CHOICE',
  text: '',
  imageUrl: '',
  points: 1,
  isRequired: true,
  requiresManualGrading: true,
  modelAnswer: '',
  matchValue: '',
  matchMode: 'EXACT',
  options: [
    { text: '', imageUrl: '', isCorrect: true },
    { text: '', imageUrl: '', isCorrect: false },
  ],
});

const blankForm = (): QuizForm => ({
  courseId: '',
  title: '',
  description: '',
  durationMin: 15,
  maxAttempts: 1,
  gradingPolicy: 'LAST_ATTEMPT',
  allowNavigation: true,
  shuffleQuestions: false,
  showCorrectAnswers: false,
  opensAt: '',
  closesAt: '',
});

/** `datetime-local` gives local wall time; convert to an ISO instant. */
export function toIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** inverse of toIso, for populating the form from an API timestamp */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function validateForm(form: QuizForm, questions: QuestionDraft[]): string[] {
  const issues: string[] = [];

  if (!form.courseId) issues.push('اختر الدورة');
  if (!form.title.trim()) issues.push('العنوان مطلوب');
  if (questions.length === 0) issues.push('أضف سؤالًا واحدًا على الأقل');

  questions.forEach((question, index) => {
    const label = `السؤال ${index + 1}`;
    if (!question.text.trim() && !question.imageUrl) issues.push(`${label}: نص السؤال أو صورته مطلوبة`);

    if (question.type === 'MULTIPLE_CHOICE') {
      const filled = question.options.filter((option) => option.text.trim() || option.imageUrl);
      if (filled.length < 2) issues.push(`${label}: يحتاج خيارين على الأقل`);
      const correctCount = question.options.filter((option) => option.isCorrect).length;
      if (correctCount === 0) issues.push(`${label}: حدّد الإجابة الصحيحة`);
      if (correctCount > 1) issues.push(`${label}: إجابة صحيحة واحدة فقط`);
    } else if (!question.requiresManualGrading && !question.matchValue.trim()) {
      issues.push(`${label}: حدّد قيمة الإجابة الصحيحة أو فعّل التصحيح اليدوي`);
    }
  });

  if (form.opensAt && form.closesAt && new Date(form.closesAt) <= new Date(form.opensAt)) {
    issues.push('وقت الانتهاء يجب أن يكون بعد وقت البداية');
  }

  return issues;
}

function toPayload(form: QuizForm, questions: QuestionDraft[]) {
  return {
    courseId: form.courseId,
    title: form.title.trim(),
    description: form.description.trim() || null,
    durationMin: Number(form.durationMin) || 0,
    maxAttempts: Number(form.maxAttempts) || 1,
    gradingPolicy: form.gradingPolicy,
    allowNavigation: form.allowNavigation,
    shuffleQuestions: form.shuffleQuestions,
    showCorrectAnswers: form.showCorrectAnswers,
    opensAt: toIso(form.opensAt),
    closesAt: toIso(form.closesAt),
    questions: questions.map((question) => ({
      ...(question.id ? { id: question.id } : {}),
      type: question.type,
      text: question.text.trim(),
      imageUrl: question.imageUrl || null,
      points: Number(question.points) || 0,
      isRequired: question.isRequired,
      requiresManualGrading:
        question.type === 'TEXT' ? question.requiresManualGrading : false,
      modelAnswer: question.modelAnswer.trim() || null,
      matchValue:
        question.type === 'TEXT' && !question.requiresManualGrading
          ? question.matchValue.trim()
          : null,
      matchMode:
        question.type === 'TEXT' && !question.requiresManualGrading ? question.matchMode : null,
      options:
        question.type === 'MULTIPLE_CHOICE'
          ? question.options
              .filter((option) => option.text.trim() || option.imageUrl)
              .map((option) => ({
                text: option.text.trim(),
                imageUrl: option.imageUrl || null,
                isCorrect: option.isCorrect,
              }))
          : [],
    })),
  };
}

function questionToDraft(question: TeacherQuestion): QuestionDraft {
  return {
    id: question.id,
    type: question.type,
    text: question.text ?? '',
    imageUrl: question.imageUrl ?? '',
    points: question.points ?? 1,
    isRequired: question.isRequired ?? true,
    requiresManualGrading: question.requiresManualGrading ?? true,
    modelAnswer: question.modelAnswer ?? '',
    matchValue: question.matchValue ?? '',
    matchMode: question.matchMode ?? 'EXACT',
    options:
      question.type === 'MULTIPLE_CHOICE'
        ? (question.options ?? []).map((option) => ({
            id: option.id,
            text: option.text ?? '',
            imageUrl: option.imageUrl ?? '',
            isCorrect: option.isCorrect === true,
          }))
        : [],
  };
}

export function useQuizEditor(quizId?: string) {
  const isNew = !quizId;
  const courses = useApiData<{ courses: { id: string; title: string }[] }>('/api/courses');

  const [form, setForm] = useState<QuizForm>(blankForm);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [students, setStudents] = useState<CandidateStudent[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [courseWide, setCourseWide] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loadingQuiz, setLoadingQuiz] = useState(!isNew);
  const [loadError, setLoadError] = useState('');

  // hydrate the draft from the API; the fetch callback owns the setState so
  // there is no cascading render from an effect body
  useEffect(() => {
    if (isNew) return;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(`/api/quizzes/${quizId}`, { cache: 'no-store' });
        const json = (await res.json()) as {
          success: boolean;
          message?: string;
          data?: { quiz: TeacherQuizDetail };
        };

        if (cancelled) return;

        if (!res.ok || !json.success || !json.data) {
          setLoadError(json.message ?? 'تعذر تحميل الاختبار');
          return;
        }

        const quiz = json.data.quiz;
        setForm({
          courseId: quiz.course?.id ?? '',
          title: quiz.title ?? '',
          description: quiz.description ?? '',
          durationMin: quiz.durationMin ?? 0,
          maxAttempts: quiz.maxAttempts ?? 1,
          gradingPolicy: quiz.gradingPolicy ?? 'LAST_ATTEMPT',
          allowNavigation: quiz.allowNavigation ?? true,
          shuffleQuestions: quiz.shuffleQuestions ?? false,
          showCorrectAnswers: quiz.showCorrectAnswers ?? false,
          opensAt: toLocalInput(quiz.opensAt),
          closesAt: toLocalInput(quiz.closesAt),
        });
        setQuestions((quiz.questions ?? []).map(questionToDraft));
        setSelected((quiz.students ?? []).map((student) => student.id));
      } catch {
        if (!cancelled) setLoadError('تعذر الاتصال بالخادم');
      } finally {
        if (!cancelled) setLoadingQuiz(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isNew, quizId]);

  // candidates follow the selected course
  useEffect(() => {
    if (!form.courseId) return;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(`/api/quizzes/candidates?courseId=${form.courseId}`);
        const json = (await res.json()) as {
          success: boolean;
          data?: {
            students: {
              id: string;
              firstName: string;
              lastName: string;
              user: { email: string };
            }[];
          };
        };

        if (cancelled || !json.success) return;

        setStudents(
          (json.data?.students ?? []).map((row) => ({
            id: row.id,
            name: `${row.firstName} ${row.lastName}`,
            email: row.user.email,
          })),
        );
      } catch {
        /* keep the previous list */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [form.courseId]);

  const setField = useCallback(<K extends keyof QuizForm>(key: K, value: QuizForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const totalPoints = useMemo(
    () => questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0),
    [questions],
  );

  const save = useCallback(async (): Promise<SaveResponse | null> => {
    const found = validateForm(form, questions);
    setIssues(found);
    if (found.length > 0) {
      setMessage('');
      return null;
    }

    setSaving(true);
    setMessage('');

    try {
      const res = await fetch(isNew ? '/api/quizzes' : `/api/quizzes/${quizId}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...toPayload(form, questions),
          studentIds: selected,
          courseWide,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        issues?: string[];
        data?: { quiz: SaveResponse };
      };

      if (!res.ok || !json.success || !json.data) {
        setIssues(json.issues ?? [json.message ?? 'تعذر الحفظ']);
        setMessage(json.message ?? 'تعذر الحفظ');
        return null;
      }

      setMessage(json.message ?? 'تم الحفظ');
      return json.data.quiz;
    } catch {
      setIssues(['تعذر الاتصال بالخادم']);
      return null;
    } finally {
      setSaving(false);
    }
  }, [form, questions, selected, courseWide, isNew, quizId]);

  return {
    form,
    setField,
    questions,
    addQuestion: () => setQuestions((prev) => [...prev, blankQuestion()]),
    removeQuestion: (index: number) =>
      setQuestions((prev) => prev.filter((_, i) => i !== index)),
    moveQuestion: (index: number, delta: number) =>
      setQuestions((prev) => {
        const next = [...prev];
        const target = index + delta;
        if (target < 0 || target >= next.length) return prev;
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
    updateQuestion: (index: number, patch: Partial<QuestionDraft>) =>
      setQuestions((prev) =>
        prev.map((question, i) => (i === index ? { ...question, ...patch } : question)),
      ),
    students,
    selected,
    setSelected,
    courseWide,
    setCourseWide,
    courses: courses.data?.courses ?? [],
    totalPoints,
    issues,
    message,
    saving,
    save,
    loading: courses.loading || loadingQuiz,
    loadError,
    isNew,
  };
}

export type QuizEditor = ReturnType<typeof useQuizEditor>;
export { QUESTION_TYPE_LABELS } from '@/lib/quiz/constants';
