'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { Card, Spinner, EmptyState } from '../../_components/ui';

interface SubjectRow {
  id: string;
  name: string;
  nameAr: string | null;
  icon: string | null;
  color: string | null;
  courseCount: number;
}

/*
 * The catalogue, and nothing else.
 *
 * This page used to be the purchase flow. Each subject rendered its three access
 * cells with a price, a "subscribed" badge, and an "اشترك الآن" button that opened
 * a dialog collecting a payment method, a transfer reference and a photo of the
 * receipt, then waited for admin approval. A locked live-broadcast card linked
 * here with `?subject=<id>&access=LIVE` to deep-link straight into that dialog.
 *
 * All of that is gone with the payment feature. What remains is what the page was
 * always for underneath: telling a student what exists. Each subject now links to
 * the content it actually contains, and every published course in it is open.
 *
 * `courseCount` is the only per-subject number left, and it comes from the
 * `_count` on the same query — the route stopped sending the `access` array, so a
 * subject with no prices still renders rather than showing an empty card.
 */
const CONTENT_LINKS = [
  { href: '/student/live', icon: '📡', label: 'البث المباشر' },
  { href: '/student/videos', icon: '🎬', label: 'الفيديوهات المسجلة' },
  { href: '/student/exercises', icon: '✏️', label: 'التمارين' },
  { href: '/student/quizzes', icon: '📝', label: 'الاختبارات' },
] as const;

export default function StudentSubjectsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const { data, error, loading } = useApiData<{ subjects: SubjectRow[] }>(
    '/api/subjects',
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

  const subjects = data?.subjects ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">المواد الدراسية</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1">
          كل المواد والدورات متاحة لك مجانًا. اختر ما تريد مشاهدته.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl">
          {error}
        </div>
      )}

      {!loading && subjects.length === 0 && (
        <EmptyState icon="📚" title="لا توجد مواد متاحة حالياً" />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {subjects.map((subject) => (
          <Card key={subject.id} hover className="overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: subject.color ?? '#E5E7EB' }} />
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: `${subject.color ?? '#4F46E5'}1A` }}
                >
                  {subject.icon ?? '📚'}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                    {subject.nameAr ?? subject.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {subject.courseCount} دورة
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {CONTENT_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 dark:hover:bg-slate-700 text-sm text-gray-700 dark:text-slate-200 transition-colors"
                  >
                    <span aria-hidden>{link.icon}</span>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}