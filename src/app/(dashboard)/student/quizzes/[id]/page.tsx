'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { QUIZ_LABELS } from '@/lib/quiz/constants';

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  status: string;
  durationMin: number;
  maxAttempts: number;
  totalPoints: number;
  allowNavigation: boolean;
  closesAt: string | null;
  course: { title: string } | null;
  questions: { id: string; type: string; points: number }[];
}

export default function StudentQuizIntroPage() {
  const params = useParams<{ id: string }>();
  const quizId = params?.id as string;
  const router = useRouter();

  const { data, loading, error, reload } = useApiData<{ quiz: Quiz }>(`/api/quizzes/${quizId}`);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const quiz = data?.quiz;

  const start = useCallback(async () => {
    setStarting(true);
    setStartError('');

    try {
      const res = await fetch(`/api/quizzes/${quizId}/attempts`, { method: 'POST' });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setStartError(json.message ?? 'تعذر بدء المحاولة');
        return;
      }

      router.push(`/student/quizzes/${quizId}/attempt/${json.data.attempt.id}`);
    } catch {
      setStartError('تعذر الاتصال بالخادم');
    } finally {
      setStarting(false);
    }
  }, [quizId, router]);

  if (loading) {
    return (
      <Frame>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </Frame>
    );
  }

  if (error || !quiz) {
    return (
      <Frame>
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">
          {error ?? 'الاختبار غير متاح'}
        </div>
      </Frame>
    );
  }

  const byType = quiz.questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.type] = (acc[question.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Frame>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{quiz.title}</h1>
            <span className="text-xs px-2 py-1 rounded-full bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300">
              {QUIZ_LABELS[quiz.status] ?? quiz.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">{quiz.course?.title}</p>
          {quiz.description && <p className="mt-3 text-sm text-gray-700 dark:text-slate-300">{quiz.description}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <Fact label="عدد الأسئلة" value={quiz.questions.length} />
          <Fact label="مجموع النقاط" value={quiz.totalPoints} />
          <Fact label="المدة" value={quiz.durationMin ? `${quiz.durationMin} دقيقة` : 'بلا حد'} />
        </div>

        <div className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
          <p>• عدد أسئلة الاختيار من متعدد: {byType.MULTIPLE_CHOICE ?? 0}</p>
          <p>• عدد أسئلة الإجابة النصية: {byType.TEXT ?? 0}</p>
          <p>
            • {quiz.allowNavigation
              ? 'يمكنك التنقل بين الأسئلة.'
              : 'يجب الإجابة بالترتيب دون الرجوع.'}
          </p>
          {quiz.closesAt && (
            <p>• ينتهي الاختبار في {new Date(quiz.closesAt).toLocaleString('ar-DZ')}</p>
          )}
        </div>

        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-4 text-sm text-indigo-900 dark:text-indigo-200">
          عند الضغط على «ابدأ» يبدأ المؤقت فورًا، وتُحفظ إجاباتك تلقائيًا أثناء المحاولة.
          لن تتمكن من تعديل الإجابات بعد إنهاء المحاولة.
        </div>

        {startError && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-300">
            {startError}
            <button onClick={reload} className="mr-3 underline">
              تحديث
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={start}
            disabled={starting}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {starting ? 'جارٍ البدء…' : 'ابدأ الاختبار'}
          </button>
          <Link
            href={`/student/quizzes/${quizId}/result`}
            className="px-5 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
          >
            عرض النتائج السابقة
          </Link>
        </div>
      </div>
    </Frame>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-slate-900/60 px-3 py-2">
      <div className="text-xs text-gray-500 dark:text-slate-400">{label}</div>
      <div className="font-medium text-gray-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60" dir="rtl">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100">الاختبار</h1>
          <Link href="/student/quizzes" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
            ← الاختبارات
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
