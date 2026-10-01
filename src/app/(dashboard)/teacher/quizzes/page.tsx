'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TeacherShell } from '../_components/shell';
import { useApiData } from '@/lib/hooks/use-api';
import { GRADING_POLICY_LABELS, QUIZ_LABELS } from '@/lib/quiz/constants';

interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  totalPoints: number;
  durationMin: number;
  maxAttempts: number;
  gradingPolicy: string;
  questionCount: number;
  assignedCount: number;
  attemptCount: number;
  pendingReviewCount: number;
  closesAt: string | null;
  course: { id: string; title: string };
}

const FILTERS = [
  { key: 'ALL', label: 'الكل' },
  { key: 'DRAFT', label: 'المسودات' },
  { key: 'ACTIVE', label: 'النشطة' },
  { key: 'ARCHIVED', label: 'المؤرشفة' },
];

function matches(row: QuizRow, filter: string) {
  if (filter === 'ALL') return true;
  if (filter === 'DRAFT') return row.status === 'DRAFT';
  if (filter === 'ARCHIVED') return row.status === 'ARCHIVED';
  return ['PUBLISHED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'].includes(row.status);
}

export default function TeacherQuizzesPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useApiData<{ quizzes: QuizRow[] }>('/api/quizzes');
  const [filter, setFilter] = useState('ALL');

  const quizzes = useMemo(() => data?.quizzes ?? [], [data]);
  const visible = useMemo(() => quizzes.filter((row) => matches(row, filter)), [quizzes, filter]);

  const archive = async (quiz: QuizRow) => {
    const action = quiz.status === 'ARCHIVED' ? 'استعادة' : 'أرشفة';
    if (!confirm(`هل تريد ${action} اختبار "${quiz.title}"؟\nلن تُحذف أي نتائج.`)) return;

    const res = await fetch(`/api/quizzes/${quiz.id}/archive`, {
      method: quiz.status === 'ARCHIVED' ? 'DELETE' : 'POST',
    });
    const json = await res.json();

    if (!res.ok || !json.success) {
      alert(json.message ?? 'تعذر تنفيذ العملية');
      return;
    }
    reload();
  };

  const publish = async (quiz: QuizRow) => {
    const res = await fetch(`/api/quizzes/${quiz.id}/publish`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok || !json.success) {
      alert(json.message ?? 'تعذر النشر');
      return;
    }
    reload();
  };

  const remove = async (quiz: QuizRow) => {
    if (!confirm(`حذف مسودة "${quiz.title}" نهائيًا؟`)) return;

    const res = await fetch(`/api/quizzes/${quiz.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json.success) {
      alert(json.message ?? 'تعذر الحذف');
      return;
    }
    reload();
  };

  return (
    <TeacherShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">الاختبارات</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            أنشئ اختبارًا، أسئنِدِه إلى التلاميذ، وتابع النتائج من مكان واحد.
          </p>
        </div>
        <button
          onClick={() => router.push('/teacher/quizzes/new')}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + اختبار جديد
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium${
              filter === item.key
                ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700">
          <p className="text-gray-500 dark:text-slate-400">لا توجد اختبارات في هذا التصنيف.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((quiz) => (
          <div key={quiz.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/teacher/quizzes/${quiz.id}`}
                className="font-semibold text-gray-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                {quiz.title}
              </Link>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 shrink-0">
                {QUIZ_LABELS[quiz.status] ?? quiz.status}
              </span>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400">{quiz.course?.title}</p>

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-slate-400">
              <span>الأسئلة: {quiz.questionCount}</span>
              <span>النقاط: {quiz.totalPoints}</span>
              <span>التلاميذ: {quiz.assignedCount}</span>
              <span>المحاولات: {quiz.attemptCount}</span>
              <span>المدة: {quiz.durationMin || '∞'} د</span>
              <span>
                المحاولات: {quiz.maxAttempts} · {GRADING_POLICY_LABELS[quiz.gradingPolicy]}
              </span>
            </div>

            {quiz.pendingReviewCount > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-2 py-1">
                {quiz.pendingReviewCount} بانتظار التصحيح اليدوي
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-slate-800">
              {quiz.status === 'DRAFT' ? (
                <>
                  <Link
                    href={`/teacher/quizzes/${quiz.id}`}
                    className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
                  >
                    تعديل
                  </Link>
                  <button
                    onClick={() => publish(quiz)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    نشر
                  </button>
                  <button
                    onClick={() => remove(quiz)}
                    className="px-3 py-1.5 rounded-lg text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    حذف
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href={`/teacher/quizzes/${quiz.id}`}
                    className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
                  >
                    إعدادات
                  </Link>
                  <Link
                    href={`/teacher/quizzes/${quiz.id}/results`}
                    className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    النتائج
                  </Link>
                  <button
                    onClick={() => archive(quiz)}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
                  >
                    {quiz.status === 'ARCHIVED' ? 'استعادة' : 'أرشفة'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </TeacherShell>
  );
}
