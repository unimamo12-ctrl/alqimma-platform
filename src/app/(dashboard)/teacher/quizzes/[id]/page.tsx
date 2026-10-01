'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TeacherShell } from '../../_components/shell';
import { QuizEditorForm } from '../_components/quiz-editor';
import { useQuizEditor } from '../_components/use-quiz-editor';
import { useApiData } from '@/lib/hooks/use-api';
import { GRADING_POLICY_LABELS, QUIZ_LABELS } from '@/lib/quiz/constants';
import type { TeacherQuizDetail } from '@/lib/quiz/types';

export default function TeacherQuizDetailPage() {
  const params = useParams<{ id: string }>();
  const quizId = params?.id as string;
  const router = useRouter();
  const editor = useQuizEditor(quizId);
  const meta = useApiData<{ quiz: TeacherQuizDetail }>(`/api/quizzes/${quizId}`);

  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const quiz = meta.data?.quiz;
  const isDraft = quiz?.storedStatus === 'DRAFT';
  const isArchived = quiz?.storedStatus === 'ARCHIVED';
  const attemptsStarted = quiz?.attemptCount ?? 0;
  // Questions freeze on the first attempt, not on publication, so a quiz that
  // was already handed out but never opened by a student stays editable.
  const locked = Boolean(quiz) && (isArchived || (!isDraft && attemptsStarted > 0));

  const run = useCallback(
    async (key: string, path: string, method: string, confirmText?: string) => {
      if (confirmText && !confirm(confirmText)) return;

      setBusy(key);
      setNotice('');

      try {
        const res = await fetch(`/api/quizzes/${quizId}/${path}`, { method });
        const json = await res.json();

        if (!res.ok || !json.success) {
          setNotice(json.message ?? 'تعذر تنفيذ العملية');
          return false;
        }

        setNotice(json.message ?? 'تم');
        meta.reload();
        return true;
      } catch {
        setNotice('تعذر الاتصال بالخادم');
        return false;
      } finally {
        setBusy('');
      }
    },
    [quizId, meta],
  );

  const publish = useCallback(async () => {
    const ok = await run('publish', 'publish', 'POST');
    if (ok) router.push('/teacher/quizzes');
  }, [run, router]);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  if (meta.loading || editor.loading) {
    return (
      <TeacherShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </TeacherShell>
    );
  }

  if (editor.loadError || meta.error || !quiz) {
    return (
      <TeacherShell>
        <div className="py-20 text-center text-gray-500 dark:text-slate-400">
          {editor.loadError ?? meta.error ?? 'الاختبار غير موجود'}
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell>
      <div className="mb-6">
        <Link href="/teacher/quizzes" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
          ← الاختبارات
        </Link>

        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">{quiz.title}</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {QUIZ_LABELS[quiz.status] ?? quiz.status} · {quiz.course?.title} ·{' '}
              {GRADING_POLICY_LABELS[quiz.gradingPolicy] ?? quiz.gradingPolicy}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <>
                <button
                  onClick={publish}
                  disabled={busy === 'publish'}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy === 'publish' ? 'جارٍ النشر…' : 'نشر الاختبار'}
                </button>
                <button
                  onClick={() =>
                    void run(
                      'archive',
                      'archive',
                      'POST',
                      'أرشفة المسودة؟ لن تُحذف البيانات.',
                    )
                  }
                  className="px-4 py-2 rounded-xl text-sm border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
                >
                  أرشفة
                </button>
              </>
            ) : (
              <>
                <Link
                  href={`/teacher/quizzes/${quizId}/results`}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                  لوحة النتائج
                </Link>
                <button
                  onClick={() =>
                    void run(
                      'archive',
                      'archive',
                      isArchived ? 'DELETE' : 'POST',
                      isArchived
                        ? 'استعادة الاختبار من الأرشيف؟'
                        : 'أرشفة الاختبار؟ ستبقى كل النتائج محفوظة.',
                    )
                  }
                  className="px-4 py-2 rounded-xl text-sm border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
                >
                  {isArchived ? 'استعادة' : 'أرشفة'}
                </button>
              </>
            )}
          </div>
        </div>

        {isArchived ? (
          <p className="mt-4 text-sm text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3">
            الاختبار مؤرشف. لا يمكن تعديله، وتبقى كل النتائج والتقارير محفوظة.
          </p>
        ) : attemptsStarted > 0 ? (
          <p className="mt-4 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-3">
            الاختبار منشور وبدأ {attemptsStarted} محاولة. الأسئلة والإجابات الصحيحة مقفلة الآن
            حمايةً لنتائج المحاولات القائمة. يمكنك تعديل النافذة الزمنية والإسناد، أو أرشفة الاختبار
            وإنشاء نسخة جديدة.
          </p>
        ) : !isDraft ? (
          <p className="mt-4 text-sm text-green-800 dark:text-emerald-300 bg-green-50 dark:bg-emerald-500/10 border border-green-200 dark:border-emerald-500/30 rounded-xl px-4 py-3">
            الاختبار منشور ولم يبدأ أي تلميذ بعد. ما زال بإمكانك تعديل الأسئلة والإسناد قبل أول
            محاولة.
          </p>
        ) : null}
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <QuizEditorForm
        editor={editor}
        locked={locked}
        submitLabel={isDraft ? undefined : 'حفظ التعديلات'}
      />
    </TeacherShell>
  );
}
