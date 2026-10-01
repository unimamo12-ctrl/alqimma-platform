'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { ATTEMPT_LABELS, GRADING_POLICY_LABELS, QUIZ_LABELS } from '@/lib/quiz/constants';
import type { AttemptSummary, GradedQuestion, StudentResult } from '@/lib/quiz/types';

function formatDuration(seconds: number) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}د ${String(s).padStart(2, '0')}ث`;
}

export default function StudentQuizResultPage() {
  const params = useParams<{ id: string }>();
  const quizId = params?.id as string;

  const { data, loading, error } = useApiData<StudentResult>(`/api/quizzes/${quizId}/result`);

  if (loading) {
    return (
      <Frame>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </Frame>
    );
  }

  if (error) {
    return (
      <Frame>
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      </Frame>
    );
  }

  if (!data) {
    return (
      <Frame>
        <div className="py-20 text-center text-gray-500 dark:text-slate-400">لا توجد نتيجة متاحة بعد.</div>
      </Frame>
    );
  }

  const quiz = data.quiz;
  const official = data.official;
  const attempts = data.attempts ?? [];

  return (
    <Frame>
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{quiz.title}</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {QUIZ_LABELS[quiz.status] ?? quiz.status} ·{' '}
                {GRADING_POLICY_LABELS[quiz.gradingPolicy] ?? ''}
              </p>
            </div>
            {official && (
              <div className="text-center">
                <div
                  className={`text-3xl font-bold${
                    official.percentage >= 50 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {official.percentage}%
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  {official.scorePoints} / {official.maxPoints}
                </div>
              </div>
            )}
          </div>

          {!official && (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              لم تُسلَّم أي محاولة بعد، أو ما زالت النتيجة بانتظار تصحيح الأستاذ.
            </p>
          )}

          {official?.requiresManualGrading && (
            <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              يوجد سؤال يحتاج تصحيحًا يدويًا، لذلك لم تُعتمد النتيجة النهائية بعد.
            </div>
          )}

          {official && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-sm">
              <Stat label="الإجابات الصحيحة" value={official.correctCount} tone="good" />
              <Stat label="الخاطئة" value={official.wrongCount} tone="bad" />
              <Stat label="بدون إجابة" value={official.unansweredCount} />
              <Stat label="النقاط" value={`${official.scorePoints} / ${official.maxPoints}`} />
              <Stat label="الوقت المستغرق" value={formatDuration(official.durationSec)} />
              <Stat label="المحاولات المستخدمة" value={data.attemptsUsed} />
              <Stat label="المحاولات المتبقية" value={data.attemptsRemaining} />
              {quiz?.gradingPolicy === 'AVERAGE' && attempts.length > 1 && (
                <Stat label="متوسط المحاولات" value={`$                {official.averagePercentage}%`} />
              )}
            </div>
          )}
        </div>

        {/* attempts history */}
        {attempts.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">سجل المحاولات</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                  <tr>
                    <Th>المحاولة</Th>
                    <Th>الحالة</Th>
                    <Th align="left">النقاط</Th>
                    <Th align="left">النسبة</Th>
                    <Th align="left">المدة</Th>
                    <Th align="left">بداية</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {attempts.map((attempt: AttemptSummary) => (
                    <tr key={attempt.id} className={attempt.isFinal ? 'bg-indigo-50/40 dark:bg-indigo-500/40 dark:bg-indigo-500/10' : ''}>
                      <td className="px-3 py-2">
                        #{attempt.attemptNumber}
                        {attempt.isFinal && (
                          <span className="mr-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">معتمدة</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-slate-400">
                        {ATTEMPT_LABELS[attempt.status] ?? attempt.status}
                      </td>
                      <td className="px-3 py-2">
                        {attempt.scorePoints} / {attempt.maxPoints}
                      </td>
                      <td className="px-3 py-2">{attempt.percentage}%</td>
                      <td className="px-3 py-2">{formatDuration(attempt.durationSec)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">
                        {new Date(attempt.startedAt).toLocaleString('ar-DZ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* per-question review, only when the teacher allows revealing */}
        {data.breakdown && data.breakdown.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">مراجعة الأسئلة</h2>
            <div className="space-y-3">
              {data.breakdown.map((question: GradedQuestion, index: number) => {
                const answer = question.answers?.[0];
                const chosen = question.options?.find(
                  (option) => option.id === answer?.selectedOptionId,
                );

                return (
                  <div key={question.id} className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-200">
                          {index + 1}. {question.text}
                        </p>
                        {question.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={question.imageUrl}
                            alt=""
                            className="mt-2 max-h-64 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 object-contain p-1"
                          />
                        )}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">
                        {answer?.pointsAwarded ?? 0} / {question.points}
                      </span>
                    </div>

                    {question.type === 'MULTIPLE_CHOICE' ? (
                      <div className="text-sm space-y-1">
                        <p className={answer?.isCorrect ? 'text-green-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
                          {answer?.isCorrect ? '✔ إجابة صحيحة' : '✘ إجابة خاطئة'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-gray-600 dark:text-slate-400">إجابتك: {chosen?.text || 'لم يجب'}</span>
                          {chosen?.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={chosen.imageUrl}
                              alt=""
                              className="h-16 w-16 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 object-contain p-1"
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-green-700 dark:text-emerald-300">
                            الصحيحة:{' '}
                            {question.options?.find((option) => option.isCorrect)?.text || '—'}
                          </span>
                          {(() => {
                            const right = question.options?.find((option) => option.isCorrect);
                            return right?.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={right.imageUrl}
                                alt=""
                                className="h-16 w-16 rounded-lg border border-green-200 dark:border-emerald-500/30 bg-white dark:bg-slate-900 object-contain p-1"
                              />
                            ) : null;
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm space-y-1">
                        <p className={answer?.isCorrect === null ? 'text-amber-700 dark:text-amber-300' : answer?.isCorrect ? 'text-green-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
                          {answer?.isCorrect === null
                            ? 'بانتظار تصحيح الأستاذ'
                            : answer?.isCorrect
                              ? '✔ إجابة صحيحة'
                              : '✘ إجابة خاطئة'}
                        </p>
                        <p className="text-gray-600 dark:text-slate-400">إجابتك: {answer?.textAnswer || 'لم يجب'}</p>
                        {question.modelAnswer && (
                          <p className="text-green-700 dark:text-emerald-300">إجابة نموذجية: {question.modelAnswer}</p>
                        )}
                      </div>
                    )}

                    {answer?.feedback && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">ملاحظة الأستاذ: {answer.feedback}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data.revealAnswers === false && quiz?.showCorrectAnswers && (
          <p className="text-xs text-gray-500 dark:text-slate-400 text-center">
            عرض الإجابات الصحيحة متاح بعد إغلاق نافذة الاختبار لجميع التلاميذ.
          </p>
        )}

        {data.attemptsRemaining > 0 && (
          <Link
            href={`/student/quizzes/${quizId}`}
            className="block text-center px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            محاولة جديدة
          </Link>
        )}
      </div>
    </Frame>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'good' | 'bad';
}) {
  const color = tone === 'good' ? 'text-green-700 dark:text-emerald-300' : tone === 'bad' ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-slate-100';
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-slate-900/60 px-3 py-2">
      <div className="text-xs text-gray-500 dark:text-slate-400">{label}</div>
      <div className={`font-medium ${color}`}>{value}</div>
    </div>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th className={`px-3 py-2 font-medium ${align === 'left' ? 'text-left' : 'text-right'}`}>
      {children}
    </th>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60" dir="rtl">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100">نتيجة الاختبار</h1>
          <Link href="/student/quizzes" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
            ← الاختبارات
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
