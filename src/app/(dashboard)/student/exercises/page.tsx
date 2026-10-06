'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { Card, Spinner, EmptyState } from '../../_components/ui';

interface ExerciseRow {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  questions: unknown[];
  course?: {
    id: string;
    title: string;
    subject?: { name: string } | null;
  } | null;
}

export default function StudentExercisesPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const { data, error, loading } = useApiData<{ exercises: ExerciseRow[] }>(
    '/api/exercises',
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

  const exercises = data?.exercises ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">التمارين</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1">تمارين تفاعلية متاحة للجميع</p>
      </div>

      {error && (
        <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 rounded-xl">
          {error}
        </div>
      )}

      {!loading && exercises.length === 0 && (
        <EmptyState
          icon="✏️"
          title="لا توجد تمارين متاحة"
          description="لا توجد تمارين بعد"
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

      {exercises.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {exercises.map((exercise) => (
            <Card key={exercise.id} hover className="p-5">
              <h2 className="font-semibold text-gray-900 dark:text-slate-100 mb-1">{exercise.title}</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">{exercise.course?.title ?? '—'}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">
                {Array.isArray(exercise.questions) ? exercise.questions.length : 0} سؤال
                {exercise.duration > 0 ? ` — ${exercise.duration} دقيقة` : ''}
              </p>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                {exercise.description || 'تمرين تفاعلي على دروس المادة.'}
              </p>
              <span className="inline-block px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-sm font-medium">
                حل التمرين
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}