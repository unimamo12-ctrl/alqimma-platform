'use client';

import Link from 'next/link';
import { useApiData } from '@/lib/hooks/use-api';
import { QUIZ_LABELS } from '@/lib/quiz/constants';

interface AssignedQuiz {
  id: string;
  title: string;
  description: string | null;
  status: string;
  durationMin: number;
  maxAttempts: number;
  totalPoints: number;
  questionCount: number;
  opensAt: string | null;
  closesAt: string | null;
  course: { id: string; title: string } | null;
  attemptsUsed: number;
  attemptsRemaining: number;
  hasOpenAttempt: boolean;
  openAttemptId: string | null;
}

const STATUS_CLASS: Record<string, string> = {
  PUBLISHED: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
  AVAILABLE: 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300',
  IN_PROGRESS: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  COMPLETED: 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300',
  EXPIRED: 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400',
  ARCHIVED: 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400',
  DRAFT: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400',
};

export default function StudentQuizzesPage() {
  const { data, loading, error } = useApiData<{ quizzes: AssignedQuiz[] }>('/api/quizzes');
  const quizzes = data?.quizzes ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60" dir="rtl">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">الاختبارات</h1>
          <Link href="/student" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
            العودة للوحة التحكم
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
        )}

        {!loading && !error && quizzes.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700">
            <p className="text-gray-500 dark:text-slate-400">لا توجد اختبارات مُسندة إليك حاليًا.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => {
            const canAct = ['AVAILABLE', 'IN_PROGRESS', 'PUBLISHED'].includes(quiz.status);
            const exhausted = quiz.attemptsRemaining <= 0;
            const href = quiz.hasOpenAttempt
              ? `/student/quizzes/${quiz.id}/attempt/${quiz.openAttemptId}`
              : `/student/quizzes/${quiz.id}`;

            return (
              <div key={quiz.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={href} className="font-semibold text-gray-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-300">
                    {quiz.title}
                  </Link>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0${STATUS_CLASS[quiz.status] ?? ''}`}>
                    {QUIZ_LABELS[quiz.status] ?? quiz.status}
                  </span>
                </div>

                {quiz.description && (
                  <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-2">{quiz.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-slate-400">
                  <span>{quiz.course?.title}</span>
                  <span>الأسئلة: {quiz.questionCount}</span>
                  <span>المدة: {quiz.durationMin ? `${quiz.durationMin} د` : 'بلا حد'}</span>
                  <span>النقاط: {quiz.totalPoints}</span>
                  <span>محاولات متبقية: {quiz.attemptsRemaining}</span>
                  <span>
                    {quiz.closesAt
                      ? `ينتهي: ${new Date(quiz.closesAt).toLocaleString('ar-DZ')}`
                      : 'بلا موعد نهائي'}
                  </span>
                </div>

                <div className="mt-auto pt-2 border-t border-gray-100 dark:border-slate-800">
                  {quiz.hasOpenAttempt ? (
                    <Link
                      href={href}
                      className="block text-center px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
                    >
                      متابعة المحاولة
                    </Link>
                  ) : quiz.status === 'COMPLETED' || quiz.status === 'EXPIRED' ? (
                    <Link
                      href={`/student/quizzes/${quiz.id}/result`}
                      className="block text-center px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
                    >
                      عرض النتيجة
                    </Link>
                  ) : canAct && !exhausted ? (
                    <Link
                      href={href}
                      className="block text-center px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      {quiz.attemptsUsed > 0 ? 'محاولة جديدة' : 'ابدأ الاختبار'}
                    </Link>
                  ) : (
                    <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-2">
                      {exhausted ? 'استنفدت المحاولات' : 'غير متاح حاليًا'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
