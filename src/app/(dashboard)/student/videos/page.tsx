'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { Card, Spinner, EmptyState } from '../../_components/ui';

interface VideoRow {
  id: string;
  title: string;
  description: string | null;
  url: string;
  duration: number;
  course?: { id: string; title: string; subject?: { name: string } | null } | null;
}

function formatDuration(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  return `${hours} ساعة و ${mins % 60} دقيقة`;
}

export default function StudentVideosPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const { data, error, loading } = useApiData<{ videos: VideoRow[] }>(
    '/api/videos',
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

  const videos = data?.videos ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">الفيديوهات المسجلة</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1">دروس مسجلة في مواد اشتركت فيها</p>
      </div>

      {error && (
        <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 rounded-xl">
          {error}
        </div>
      )}

      {!loading && videos.length === 0 && (
        <EmptyState
          icon="🎬"
          title="لا توجد فيديوهات متاحة"
          description="اشترك في مادة للوصول إلى فيديوهاتها المسجلة"
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

      {videos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <Card key={video.id} hover className="overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                <span className="text-4xl opacity-50">▶️</span>
              </div>
              <div className="p-4">
                <h2 className="font-semibold text-gray-900 dark:text-slate-100 mb-1">{video.title}</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">{video.course?.title ?? '—'}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">{formatDuration(video.duration)}</p>
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block w-full text-center py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                >
                  مشاهدة
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}