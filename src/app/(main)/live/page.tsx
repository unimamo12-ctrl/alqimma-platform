'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteShell from '@/components/site-shell';
import { Icon } from '@/components/icons';

interface LiveRow {
  id: string;
  title: string;
  description?: string | null;
  scheduledAt: string;
  status: string;
  thumbnail?: string | null;
  isRecorded?: boolean;
  recordingUrl?: string | null;
  course?: {
    id: string;
    title: string;
    isRecorded?: boolean;
    recordingUrl?: string | null;
    subject?: { name: string } | null;
  } | null;
  teacher?: { id: string; firstName: string; lastName: string } | null;
}

const STATUS_META: Record<string, { label: string; dot: string; pill: string }> = {
  LIVE: { label: 'مباشر الآن', dot: 'bg-rose-500', pill: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-200' },
  SCHEDULED: { label: 'مجدولة', dot: 'bg-indigo-500', pill: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-200' },
  ENDED: { label: 'منتهية', dot: 'bg-slate-400', pill: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200' },
  CANCELLED: { label: 'ملغاة', dot: 'bg-slate-300', pill: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200' },
};

export default function AllLivePage() {
  const [sessions, setSessions] = useState<LiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'SCHEDULED'>('ALL');

  // Same shape as `useApiData` in src/lib/hooks/use-api.ts: every state update happens
  // after an await, so the effect body never sets state synchronously. Hoisting this into a
  // useCallback and calling it from the effect trips react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/live', { cache: 'no-store' });
        const json = await res.json();

        if (cancelled) return;

        if (res.status === 401) {
          setNeedsAuth(true);
          setMessage(``);
          return;
        }

        if (!json.success) {
          setMessage(json.message || 'تعذر تحميل البثوث');
          return;
        }

        setNeedsAuth(false);
        setMessage(``);
        setSessions(json.data?.sessions ?? []);
      } catch {
        if (!cancelled) setMessage('تعذر الاتصال بالخادم');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const visible = sessions.filter((s) => {
    if (filter === 'ALL') return true;
    return s.status === filter;
  });

  const liveCount = sessions.filter((s) => s.status === 'LIVE').length;
  const scheduledCount = sessions.filter((s) => s.status === 'SCHEDULED').length;

  const filters: { key: 'ALL' | 'LIVE' | 'SCHEDULED'; label: string; count: number }[] = [
    { key: 'ALL', label: 'الكل', count: sessions.length },
    { key: 'LIVE', label: 'مباشر الآن', count: liveCount },
    { key: 'SCHEDULED', label: 'مجدولة', count: scheduledCount },
  ];

  return (
    <SiteShell>
      <section className="border-b border-slate-200 dark:border-slate-700 bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100">
            <Icon name="broadcast" className="h-3.5 w-3.5" />
            البث المباشر
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            كل البثوث المباشرة
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
            الحصص المباشرة والمقادة المتاحة في المنصة. انضم إلى الحصة مباشرة أو ادخل لاحقًا.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            ))}
          </div>
        ) : needsAuth ? (
          <div className="mx-auto max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-14 text-center shadow-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Icon name="user" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">سجّل الدخول لمشاهدة البثوث</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              البثوث المباشرة متاحة للطلبة المشتركين في المواد. سجّل دخولك للمتابعة.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 hover:shadow-md"
            >
              <Icon name="login" className="h-4 w-4" />
              تسجيل الدخول
            </Link>
          </div>
        ) : message ? (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-5 py-4 text-sm text-rose-700 dark:text-rose-300">
            {message}
          </div>
        ) : (
          <>
            {sessions.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors${
                      filter === f.key
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {f.label}
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold${
                        filter === f.key ? 'bg-white/15 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {visible.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-16 text-center shadow-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-300">
                  <Icon name="broadcast" className="h-6 w-6" />
                </span>
                <h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">لا توجد بثوث هنا حاليًا</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {sessions.length === 0
                    ? 'لا توجد حصص مباشرة أو مجدولة متاحة لاشتراكاتك.'
                    : 'لا توجد بثوث مطابقة للتصفية المختارة.'}
                </p>
                <Link
                  href="/login"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60"
                >
                  تصفح المواد والاشتراك
                </Link>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((session) => {
                  const meta = STATUS_META[session.status] ?? STATUS_META.ENDED;
                  const isLive = session.status === 'LIVE';
                  const teacherName = session.teacher
                    ? `أ. ${session.teacher.firstName} ${session.teacher.lastName}`
                    : null;
                  // Same rule as the student list: an ended session is a replay,
                  // so the action points at the recording, never the dead room.
                  const replayUrl = session.recordingUrl ?? session.course?.recordingUrl ?? null;

                  return (
                    <article
                      key={session.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg hover:shadow-slate-900/5"
                    >
                      <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                        <Icon name="video" className="h-9 w-9 text-white/25" />

                        <span
                          className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1${meta.pill}`}
                        >
                          <span className="relative flex h-1.5 w-1.5">
                            {isLive && (
                              <span
                                className={`absolute inline-flex h-full w-full animate-ping rounded-full ${meta.dot} opacity-75`}
                              />
                            )}
                            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          </span>
                          {meta.label}
                        </span>

                        {isLive && (
                          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 dark:bg-slate-900/10 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                            <Icon name="play" className="h-3 w-3" strokeWidth={2} />
                            جارٍ البث
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-5">
                        <h3 className="font-semibold leading-snug text-slate-900 dark:text-slate-100 transition-colors group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                          {session.title}
                        </h3>

                        {session.course?.title && (
                          <p className="mt-1.5 truncate text-sm text-slate-500 dark:text-slate-400">
                            {session.course.title}
                          </p>
                        )}

                        <dl className="mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                          {teacherName && (
                            <div className="flex items-center gap-2">
                              <Icon name="user" className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-300" />
                              <dd className="truncate">{teacherName}</dd>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Icon name="clock" className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-300" />
                            <dd dir="ltr" className="truncate">
                              {new Date(session.scheduledAt).toLocaleString('ar-DZ')}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-5 pt-1">
                          {session.status === 'SCHEDULED' ? (
                            <Link
                              href={`/student/live/${session.id}`}
                              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300"
                            >
                              <Icon name="calendar" className="h-4 w-4" />
                              دخول غرفة الحصة
                            </Link>
                          ) : session.status === 'LIVE' ? (
                            <Link
                              href={`/student/live/${session.id}`}
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-rose-600/25 transition-all hover:bg-rose-700 hover:shadow-md"
                            >
                              <Icon name="play" className="h-4 w-4" strokeWidth={2} />
                              انضم الآن
                            </Link>
                          ) : replayUrl ? (
                            <a
                              href={replayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                            >
                              <Icon name="play" className="h-4 w-4" />
                              مشاهدة التسجيل
                            </a>
                          ) : (
                            <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                              انتهت هذه الحصة
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </SiteShell>
  );
}
