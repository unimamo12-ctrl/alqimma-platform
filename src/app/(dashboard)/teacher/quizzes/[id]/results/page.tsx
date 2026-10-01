'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TeacherShell } from '../../../_components/shell';
import { useApiData } from '@/lib/hooks/use-api';
import { ATTEMPT_LABELS, GRADING_POLICY_LABELS, QUIZ_LABELS } from '@/lib/quiz/constants';
import type {
  GradedQuestion,
  ResultsOverview,
  ResultsRow,
  StudentDetail,
} from '@/lib/quiz/types';

const STATE_LABELS: Record<string, string> = {
  NOT_STARTED: 'لم يبدأ',
  IN_PROGRESS: 'جارية',
  PENDING_REVIEW: 'بانتظار التصحيح',
  COMPLETED: 'مصحّحة',
};

const STATE_CLASS: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400',
  IN_PROGRESS: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
  PENDING_REVIEW: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  COMPLETED: 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300',
};

function formatDuration(seconds: number) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}د ${String(s).padStart(2, '0')}ث`;
}

export default function TeacherQuizResultsPage() {
  const params = useParams<{ id: string }>();
  const quizId = params?.id as string;

  const overview = useApiData<ResultsOverview>(`/api/quizzes/${quizId}/results`);
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const detail = useApiData<StudentDetail>(
    openStudent ? `/api/quizzes/${quizId}/results?studentId=${openStudent}` : null,
  );

  const rows = useMemo<ResultsRow[]>(() => overview.data?.rows ?? [], [overview.data]);
  const summary = overview.data?.summary;
  const quiz = overview.data?.quiz;

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const order: Record<ResultsRow['state'], number> = {
          PENDING_REVIEW: 0,
          IN_PROGRESS: 1,
          COMPLETED: 2,
          NOT_STARTED: 3,
        };
        const diff = order[a.state] - order[b.state];
        return diff !== 0 ? diff : b.percentage - a.percentage;
      }),
    [rows],
  );

  return (
    <TeacherShell>
      <div className="mb-6">
        <Link href="/teacher/quizzes" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
          ← الاختبارات
        </Link>
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mt-2">{quiz?.title ?? 'النتائج'}</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {quiz ? `${QUIZ_LABELS[quiz.status] ?? quiz.status} · ${GRADING_POLICY_LABELS[quiz.gradingPolicy] ?? ''}` : ''}
        </p>
      </div>

      {overview.loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      )}

      {overview.error && (
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">
          {overview.error}
        </div>
      )}

      {summary && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
          <Stat label="مُسند" value={summary.assigned} />
          <Stat label="مصحّح" value={summary.completed} />
          <Stat label="بانتظار التصحيح" value={summary.pendingReview} tone={summary.pendingReview > 0 ? 'warn' : 'default'} />
          <Stat label="لم يبدأ" value={summary.notStarted} />
          <Stat label="متوسط النسبة" value={`${summary.averagePercentage}%`} />
          <Stat label="أعلى نسبة" value={`${summary.highestPercentage}%`} />
          <Stat label="جارية الآن" value={summary.inProgress} />
          <Stat label="الأسئلة" value={quiz?.questionCount ?? 0} />
        </div>
      )}

      {/* ---- per-student drill-down ---- */}
      {openStudent && detail.data && (
        <StudentDetail
          quizId={quizId}
          data={detail.data}
          onClose={() => setOpenStudent(null)}
          onGraded={() => {
            detail.reload();
            overview.reload();
          }}
        />
      )}

      {/* ---- results table ---- */}
      {sorted.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
              <tr>
                <Th>التلميذ</Th>
                <Th>الحالة</Th>
                <Th align="left">المحاولات</Th>
                <Th align="left">الصحيحة</Th>
                <Th align="left">الخاطئة</Th>
                <Th align="left">بدون إجابة</Th>
                <Th align="left">النقاط</Th>
                <Th align="left">النسبة</Th>
                <Th align="left">الوقت</Th>
                <Th align="left">تفاصيل</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {sorted.map((row) => (
                <tr key={row.studentId} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
                  <td className="px-3 py-2">
                    <div className="text-gray-900 dark:text-slate-100">{row.name}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{row.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-1 rounded-full${STATE_CLASS[row.state]}`}>
                      {STATE_LABELS[row.state] ?? row.state}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-slate-300">
                    {row.attemptsUsed} / {row.attemptsUsed + row.attemptsRemaining}
                  </td>
                  <td className="px-3 py-2 text-green-700 dark:text-emerald-300">{row.state === 'COMPLETED' ? row.correctCount : '—'}</td>
                  <td className="px-3 py-2 text-red-700 dark:text-red-300">{row.state === 'COMPLETED' ? row.wrongCount : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-slate-400">{row.state === 'COMPLETED' ? row.unansweredCount : '—'}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-slate-300">
                    {row.state === 'COMPLETED' ? `${row.scorePoints} / ${row.maxPoints}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {row.state === 'COMPLETED' ? (
                      <div>
                        <span
                          className={
                            row.percentage >= 50 ? 'text-green-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                          }
                        >
                          {row.percentage}%
                        </span>
                        {row.attemptsUsed > 1 && (
                          <div className="text-xs text-gray-400 dark:text-slate-500">
                            متوسط {row.averagePercentage}%
                          </div>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{formatDuration(row.durationSec)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setOpenStudent(row.studentId)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                    >
                      فتح الملف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!overview.loading && rows.length === 0 && (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700">
          <p className="text-gray-500 dark:text-slate-400">لم يُسند هذا الاختبار لأي تلميذ بعد.</p>
        </div>
      )}
    </TeacherShell>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th className={`px-3 py-2 font-medium ${align === 'left' ? 'text-left' : 'text-right'}`}>
      {children}
    </th>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warn';
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
      <div className="text-xs text-gray-500 dark:text-slate-400">{label}</div>
      <div className={`text-2xl font-bold${tone === 'warn' ? 'text-amber-600' : 'text-gray-900 dark:text-slate-100'}`}>
        {value}
      </div>
    </div>
  );
}

/** ---- one student's file inside this quiz, with manual correction ---- */
function StudentDetail({
  quizId,
  data,
  onClose,
  onGraded,
}: {
  quizId: string;
  data: StudentDetail;
  onClose: () => void;
  onGraded: () => void;
}) {
  const attempts = data.attempts ?? [];
  const [activeId, setActiveId] = useState<string | null>(attempts[0]?.id ?? null);
  const [overrides, setOverrides] = useState<
    Record<string, { isCorrect: boolean; feedback: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const active = attempts.find((attempt) => attempt.id === activeId) ?? attempts[0];

  // drafts are derived from the selected attempt, then overlaid with edits;
  // switching attempts clears the overrides instead of syncing state in an effect
  const drafts = useMemo(() => {
    const base: Record<string, { isCorrect: boolean; feedback: string }> = {};
    for (const question of active?.breakdown ?? []) {
      const answer = question.answers?.[0];
      base[question.id] = overrides[question.id] ?? {
        isCorrect: answer?.isCorrect ?? false,
        feedback: answer?.feedback ?? '',
      };
    }
    return base;
  }, [active, overrides]);

  const selectAttempt = (id: string) => {
    setOverrides({});
    setNotice('');
    setActiveId(id);
  };

  const pending = useMemo(
    () => (active?.breakdown ?? []).filter((question) => question.answers?.[0]?.isCorrect === null),
    [active],
  );

  const submitGrading = async () => {
    if (!active || pending.length === 0) return;

    setSaving(true);
    setNotice('');

    try {
      const res = await fetch(`/api/quizzes/${quizId}/manual-grading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: active.id,
          grades: pending.map((question: GradedQuestion) => ({
            questionId: question.id,
            isCorrect: drafts[question.id]?.isCorrect ?? false,
            pointsAwarded: (drafts[question.id]?.isCorrect ?? false) ? question.points : 0,
            feedback: drafts[question.id]?.feedback || null,
          })),
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setNotice(json.message ?? 'تعذر حفظ التصحيح');
        return;
      }

      setNotice(json.message ?? 'تم الحفظ');
      onGraded();
    } catch {
      setNotice('تعذر الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">{data.student?.name}</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400">{data.student?.email}</p>
        </div>
        <button
          onClick={onClose}
          className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
        >
          إغلاق ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {attempts.map((attempt) => (
          <button
            key={attempt.id}
            onClick={() => selectAttempt(attempt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs border${
              attempt.id === active?.id
                ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 text-indigo-700 dark:text-indigo-300'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-900/60'
            }`}
          >
            محاولة {attempt.attemptNumber}
            <span className="mr-1">
              ({ATTEMPT_LABELS[attempt.status] ?? attempt.status})
            </span>
            {attempt.isFinal && <span className="mr-1 text-green-600 dark:text-emerald-400">• معتمدة</span>}
          </button>
        ))}
      </div>

      {active && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-4 text-sm">
            <Mini label="النقاط" value={`${active.scorePoints} / ${active.maxPoints}`} />
            <Mini label="النسبة" value={`${active.percentage}%`} />
            <Mini label="صحيحة" value={active.correctCount} />
            <Mini label="خاطئة" value={active.wrongCount} />
            <Mini label="بدون إجابة" value={active.unansweredCount} />
            <Mini label="المدة" value={formatDuration(active.durationSec)} />
          </div>

          {pending.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 mb-4 text-sm text-amber-800 dark:text-amber-200">
              {pending.length} إجابة نصية بانتظار التصحيح اليدوي. النتيجة غير معتمدة حتى تصحّحها.
            </div>
          )}

          <div className="space-y-4">
            {(active.breakdown ?? []).map((question: GradedQuestion, index: number) => {
              const answer = question.answers?.[0];
              const chosen = question.options?.find(
                (option) => option.id === answer?.selectedOptionId,
              );
              const correct = question.options?.find((option) => option.isCorrect);
              const draft = drafts[question.id];

              return (
                <div key={question.id} className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200">
                      {index + 1}. {question.text}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">{question.points} نقطة</span>
                  </div>

                  {question.type === 'MULTIPLE_CHOICE' ? (
                    <div className="mt-2 text-sm">
                      <p className="text-gray-700 dark:text-slate-300">
                        إجابة التلميذ:{' '}
                        <span className={answer?.isCorrect ? 'text-green-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
                          {chosen?.text ?? 'لم يجب'}
                        </span>
                      </p>
                      <p className="text-gray-700 dark:text-slate-300">
                        الإجابة الصحيحة:{' '}
                        <span className="text-green-700 dark:text-emerald-300">{correct?.text ?? '—'}</span>
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm space-y-2">
                      <p className="text-gray-700 dark:text-slate-300">
                        إجابة التلميذ:{' '}
                        <span className="text-gray-900 dark:text-slate-100">{answer?.textAnswer || 'لم يجب'}</span>
                      </p>
                      <p className="text-gray-700 dark:text-slate-300">
                        الإجابة النموذجية:{' '}
                        <span className="text-green-700 dark:text-emerald-300">{question.modelAnswer || '—'}</span>
                      </p>

                      {answer?.isCorrect === null && active.status !== 'IN_PROGRESS' && (
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
                          <label className="flex items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={draft?.isCorrect ?? false}
                              onChange={(e) =>
                                setOverrides((prev) => ({
                                  ...prev,
                                  [question.id]: {
                                    isCorrect: e.target.checked,
                                    feedback: prev[question.id]?.feedback ?? draft?.feedback ?? '',
                                  },
                                }))
                              }
                            />
                            صحيحة
                          </label>
                          <input
                            value={draft?.feedback ?? ''}
                            onChange={(e) =>
                              setOverrides((prev) => ({
                                ...prev,
                                [question.id]: {
                                  isCorrect: prev[question.id]?.isCorrect ?? draft?.isCorrect ?? false,
                                  feedback: e.target.value,
                                },
                              }))
                            }
                            placeholder="ملاحظة للتلميذ (اختياري)"
                            className="flex-1 min-w-[12rem] rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm"
                          />
                        </div>
                      )}

                      {answer?.isCorrect === true && (
                        <p className="text-green-700 dark:text-emerald-300 text-sm">✔ صحيحة ({answer.pointsAwarded} نقطة)</p>
                      )}
                      {answer?.isCorrect === false && (
                        <p className="text-red-700 dark:text-red-300 text-sm">✘ خاطئة (0 نقطة)</p>
                      )}
                    </div>
                  )}

                  {answer?.feedback && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">ملاحظة: {answer.feedback}</p>
                  )}

                  <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
                    وقت الإجابة: {answer ? new Date(answer.answeredAt ?? '').toLocaleString('ar-DZ') : '—'}
                  </p>
                </div>
              );
            })}
          </div>

          {pending.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={submitGrading}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ…' : 'اعتماد التصحيح'}
              </button>
              {notice && <span className="text-sm text-green-700 dark:text-emerald-300">{notice}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-slate-900/60 px-3 py-2">
      <div className="text-xs text-gray-500 dark:text-slate-400">{label}</div>
      <div className="font-medium text-gray-900 dark:text-slate-100">{value}</div>
    </div>
  );
}
