'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { Card, Badge, Spinner, EmptyState } from '../../_components/ui';

interface LiveSessionRow {
  id: string;
  title: string;
  scheduledAt: string;
  status: string;
  endedAt?: string | null;
  isRecorded?: boolean;
  recordingUrl?: string | null;
  // undefined for teachers/admins, who are never gated
  hasAccess?: boolean;
  course?: {
    id: string;
    title: string;
    type?: 'FREE' | 'PAID';
    subjectId?: string;
    subject?: { id?: string; name: string; nameAr?: string | null };
    isRecorded?: boolean;
    recordingUrl?: string | null;
    videos?: { id: string; title: string; url: string }[];
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'مجدولة',
  LIVE: 'مباشر الآن',
  ENDED: 'منتهية',
  CANCELLED: 'ملغاة',
};

export default function StudentLiveListPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const { data, error, loading } = useApiData<{ sessions: LiveSessionRow[] }>(
    '/api/live',
    authChecked,
  );

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success || json.data?.user.role !== 'STUDENT') {
          router.replace('/login');
          return;
        }
        setAuthChecked(true);
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <Spinner />
      </div>
    );
  }

  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">البث المباشر</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1">الحصص المباشرة والمقادة في مواد مشترك فيها</p>
      </div>

      {error && (
        <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 rounded-xl">
          {error}
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <EmptyState
          icon="📡"
          title="لا توجد حصص مباشرة حالياً"
          description="اشترك في مادة للوصول إلى بثها المباشر"
          action={
            <Link
              href="/student/subjects"
              className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            >
              تصفح المواد
            </Link>
          }
        />
      )}

      {sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sessions.map((item) => {
            /*
             * An ended session is only ever a replay: the room is gone, so the
             * button points at the recording instead of the dead room URL.
             * `recordingUrl` on the session, then on the course, then a published
             * video on the course — the teacher may have recorded, or published
             * the recording as a lesson, and either is a valid way back in.
             */
            const replayUrl =
              item.recordingUrl ?? item.course?.recordingUrl ?? item.course?.videos?.[0]?.url ?? null;
            const isEnded = item.status === 'ENDED' || item.status === 'CANCELLED';

            /*
             * A FREE course is joinable by anyone; a PAID one needs the LIVE
             * subscription for its subject. The API sends `hasAccess` so the card
             * can offer the right action instead of a join button that 403s.
             */
            const locked = item.hasAccess === false;
            const subjectName =
              item.course?.subject?.nameAr ?? item.course?.subject?.name ?? '';
            const subscribeHref = item.course?.subjectId
              ? `/student/subjects?subject=${encodeURIComponent(item.course.subjectId)}&access=LIVE`
              : '/student/subjects';

            return (
              <Card key={item.id} hover className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="font-semibold text-gray-900 dark:text-slate-100">{item.title}</h2>
                  {item.status === 'LIVE' ? (
                    <Badge variant="red">{STATUS_LABELS[item.status]}</Badge>
                  ) : isEnded ? (
                    <Badge variant="gray">{STATUS_LABELS[item.status] ?? item.status}</Badge>
                  ) : (
                    <Badge variant="indigo">{STATUS_LABELS[item.status]}</Badge>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">{item.course?.title ?? '—'}</p>
                <p className="text-sm text-gray-400 dark:text-slate-500 mb-4" dir="ltr">
                  {new Date(item.scheduledAt).toLocaleString('ar-DZ')}
                </p>

                {locked ? (
                  <div className="space-y-2">
                    <Link
                      href={subscribeHref}
                      className="inline-block w-full text-center py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                    >
                      اشترك لتنضم
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-slate-400 text-center">
                      بث يتطلب اشتراكًا في «البث المباشر»{subjectName ? ` — ${subjectName}` : ''}
                    </p>
                  </div>
                ) : isEnded ? (
                  replayUrl ? (
                    <a
                      href={replayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block w-full text-center py-2.5 rounded-xl bg-slate-700 dark:bg-slate-800 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
                    >
                      مشاهدة التسجيل
                    </a>
                  ) : (
                    <span className="inline-block w-full text-center py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 text-sm font-medium">
                      لا يوجد تسجيل
                    </span>
                  )
                ) : (
                  <Link
                    href={`/student/live/${item.id}`}
                    className={`inline-block w-full text-center py-2.5 rounded-xl text-sm font-medium transition-colors${
                      item.status === 'LIVE'
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {item.status === 'LIVE' ? 'انضم الآن' : 'دخول غرفة الحصة'}
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}