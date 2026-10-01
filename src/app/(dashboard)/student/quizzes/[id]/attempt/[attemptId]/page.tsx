'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { QUESTION_TYPE_LABELS } from '@/lib/quiz/constants';
import type { AttemptPayload, SavedAnswer, StudentQuestion } from '@/lib/quiz/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function StudentQuizAttemptPage() {
  const params = useParams<{ id: string; attemptId: string }>();
  const quizId = params?.id as string;
  const attemptId = params?.attemptId as string;
  const router = useRouter();

  const [data, setData] = useState<AttemptPayload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<Record<string, SavedAnswer>>({});
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const submittingRef = useRef(false);

  // ---- load (also re-hydrates after a refresh) ----
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}`);
        const json = await res.json();

        if (cancelled) return;

        if (!res.ok || !json.success) {
          setLoadError(json.message ?? 'تعذر تحميل المحاولة');
          return;
        }

        const payload = json.data as AttemptPayload;
        setData(payload);
        setAnswers(payload.savedAnswers ?? {});
        setTextDrafts(
          Object.fromEntries(
            Object.entries(payload.savedAnswers ?? {}).map(([key, value]) => [
              key,
              value.textAnswer ?? '',
            ]),
          ),
        );
      } catch {
        if (!cancelled) setLoadError('تعذر الاتصال بالخادم');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [quizId, attemptId]);

  // ---- countdown, driven by the server deadline ----
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!data?.attempt.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data?.attempt.expiresAt]);

  const remaining = data?.attempt.expiresAt
    ? new Date(data.attempt.expiresAt).getTime() - now
    : null;

  // ---- autosave ----
  // one debounce timer per question: moving between questions must not drop
  // text that has not reached the server yet
  const textTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingText = useRef<Record<string, string>>({});
  const saveSeq = useRef<Record<string, number>>({});

  const sendAnswer = useCallback(
    async (questionId: string, payload: { selectedOptionId?: string | null; textAnswer?: string | null }) => {
      const seq = (saveSeq.current[questionId] ?? 0) + 1;
      saveSeq.current[questionId] = seq;
      setSaveState('saving');

      try {
        const res = await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}/answers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId, ...payload }),
        });
        const json = await res.json();

        // a newer keystroke already went out; its result is the one that counts
        if (saveSeq.current[questionId] !== seq) return true;

        if (!res.ok || !json.success) {
          setSaveState('error');
          setNotice(json.message ?? 'تعذر حفظ الإجابة');
          return false;
        }

        setSaveState('saved');
        return true;
      } catch {
        if (saveSeq.current[questionId] === seq) setSaveState('error');
        return false;
      }
    },
    [quizId, attemptId],
  );

  /** writes every debounced keystroke immediately; awaited before submitting */
  const flushText = useCallback(async () => {
    const entries = Object.entries(pendingText.current);
    if (entries.length === 0) return;

    pendingText.current = {};

    for (const [questionId, textAnswer] of entries) {
      const timer = textTimers.current[questionId];
      if (timer) {
        clearTimeout(timer);
        delete textTimers.current[questionId];
      }
      await sendAnswer(questionId, { textAnswer });
    }
  }, [sendAnswer]);

  const submit = useCallback(
    async (silent = false) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);

      try {
        // never submit text that is still sitting in a debounce timer
        await flushText();

        const res = await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}/submit`, {
          method: 'POST',
        });
        const json = await res.json();

        // a 409 here means the server already closed it, which is fine
        if (res.ok && json.success) {
          router.replace(`/student/quizzes/${quizId}/result`);
          return;
        }

        if (!silent) setNotice(json.message ?? 'تعذر إنهاء المحاولة');
      } catch {
        if (!silent) setNotice('تعذر الاتصال بالخادم');
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [quizId, attemptId, router, flushText],
  );

  // the timer running out finalizes on the server's terms
  useEffect(() => {
    if (remaining === null || remaining > 0) return;
    // deferred so the submit path owns its own state updates
    const timer = setTimeout(() => void submit(true), 0);
    return () => clearTimeout(timer);
  }, [remaining, submit]);

  const onTextChange = useCallback(
    (questionId: string, value: string) => {
      setTextDrafts((prev) => ({ ...prev, [questionId]: value }));
      setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], textAnswer: value } }));
      pendingText.current[questionId] = value;

      const existing = textTimers.current[questionId];
      if (existing) clearTimeout(existing);

      textTimers.current[questionId] = setTimeout(() => {
        delete textTimers.current[questionId];
        const latest = pendingText.current[questionId];
        delete pendingText.current[questionId];
        void sendAnswer(questionId, { textAnswer: latest });
      }, 800);
    },
    [sendAnswer],
  );

  // last-ditch save on tab close; the server still has the final say on whether
  // an already-closed attempt still accepts writes
  useEffect(() => {
    const handler = () => {
      for (const [questionId, textAnswer] of Object.entries(pendingText.current)) {
        void fetch(`/api/quizzes/${quizId}/attempts/${attemptId}/answers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId, textAnswer }),
          keepalive: true,
        });
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [quizId, attemptId]);

  const choose = useCallback(
    (questionId: string, optionId: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], selectedOptionId: optionId } }));
      void sendAnswer(questionId, { selectedOptionId: optionId });
    },
    [sendAnswer],
  );

  const questions = useMemo<StudentQuestion[]>(() => data?.questions ?? [], [data]);
  const current = questions[index];
  const answered = useMemo(() => {
    return questions.filter((question) => {
      const answer = answers[question.id];
      return Boolean(answer?.selectedOptionId || answer?.textAnswer?.trim());
    }).length;
  }, [questions, answers]);

  if (loadError) {
    return (
      <Frame>
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">
          {loadError}
        </div>
        <Link href="/student/quizzes" className="mt-4 inline-block text-sm text-indigo-600 dark:text-indigo-400">
          ← العودة للاختبارات
        </Link>
      </Frame>
    );
  }

  if (!data || !current) {
    return (
      <Frame>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </Frame>
    );
  }

  const urgent = remaining !== null && remaining < 60_000;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60" dir="rtl">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-bold text-gray-900 dark:text-slate-100 truncate">{data.attempt.title}</h1>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              محاولة {data.attempt.attemptNumber} · {answered} / {questions.length} مُجابة
            </p>
          </div>

          <div className="flex items-center gap-3">
            {remaining !== null && (
              <span
                className={`px-3 py-1.5 rounded-lg text-sm font-mono font-bold${
                  urgent ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 animate-pulse' : 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200'
                }`}
                dir="ltr"
              >
                {formatClock(remaining)}
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-slate-400">
              {saveState === 'saving' && 'جارٍ الحفظ…'}
              {saveState === 'saved' && 'تم الحفظ'}
              {saveState === 'error' && 'تعذر الحفظ'}
            </span>
            <button
              onClick={() => {
                if (!confirm('هل تريد إنهاء المحاولة؟ لن تتمكن من التعديل بعدها.')) return;
                void submit();
              }}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'جارٍ الإنهاء…' : 'إنهاء المحاولة'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6 lg:grid-cols-[1fr_14rem]">
        <div className="space-y-4">
          {notice && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              {notice}
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  السؤال {index + 1} من {questions.length}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">
                  {QUESTION_TYPE_LABELS[current.type]} · {current.points} نقطة
                  {current.isRequired && ' · إجباري'}
                </p>
              </div>
              <div className="h-2 w-32 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${((index + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            {current.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.imageUrl}
                alt=""
                className="max-h-96 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 object-contain p-1 mb-4"
              />
            )}

            {current.text && (
              <p className="text-gray-900 dark:text-slate-100 leading-relaxed mb-5">{current.text}</p>
            )}

            {current.type === 'MULTIPLE_CHOICE' ? (
              <div className="space-y-2">
                {current.options.map((option) => {
                  const selected = answers[current.id]?.selectedOptionId === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                          : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-900/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${current.id}`}
                        checked={selected}
                        onChange={() => choose(current.id, option.id)}
                        className="mt-1 shrink-0"
                      />
                      {option.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={option.imageUrl}
                          alt=""
                          className="max-h-40 w-40 shrink-0 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 object-contain p-1"
                        />
                      )}
                      {option.text && (
                        <span className="text-sm text-gray-800 dark:text-slate-200">{option.text}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={textDrafts[current.id] ?? ''}
                onChange={(e) => onTextChange(current.id, e.target.value)}
                rows={6}
                placeholder="اكتب إجابتك هنا… تُحفظ تلقائيًا"
                className="w-full rounded-xl border border-gray-300 dark:border-slate-600 px-4 py-3 text-sm"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="px-4 py-2 rounded-xl text-sm border border-gray-200 dark:border-slate-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
            >
              → السابق
            </button>
            {index < questions.length - 1 ? (
              <button
                onClick={() => setIndex((i) => i + 1)}
                className="px-4 py-2 rounded-xl text-sm border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
              >
                التالي ←
              </button>
            ) : (
              <button
                onClick={() => void submit()}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                إنهاء وتسليم
              </button>
            )}
          </div>
        </div>

        {/* question navigator */}
        <aside className="lg:sticky lg:top-24 h-max">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">التقدّم</p>
            <div className="grid grid-cols-5 lg:grid-cols-4 gap-2">
              {questions.map((question, i) => {
                const isAnswered = Boolean(
                  answers[question.id]?.selectedOptionId || answers[question.id]?.textAnswer?.trim(),
                );
                const isCurrent = i === index;

                return (
                  <button
                    key={question.id}
                    onClick={() => data.attempt.allowNavigation && setIndex(i)}
                    disabled={!data.attempt.allowNavigation}
                    className={`w-9 h-9 rounded-lg text-sm font-medium border disabled:cursor-not-allowed${
                      isCurrent
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : isAnswered
                          ? 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300 border-green-200 dark:border-emerald-500/30'
                          : 'bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-500 dark:text-slate-400 space-y-1">
              <p className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-green-50 dark:bg-emerald-500/10 border border-green-200 dark:border-emerald-500/30" /> مُجابة
              </p>
              <p className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700" /> غير مُجابة
              </p>
              {!data.attempt.allowNavigation && (
                <p>التنقل المباشر معطّل — تابع الأسئلة بالترتيب.</p>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-600 dark:text-slate-400">
              النقاط: <span className="font-medium">{data.attempt.totalPoints}</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60" dir="rtl">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100">المحاولة</h1>
          <Link href="/student/quizzes" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
            ← الاختبارات
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
