'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiData, type SessionUser } from '@/lib/hooks/use-api';
import { Card, StatCard, Spinner, Badge } from '../_components/ui';

interface LiveRow {
  id: string;
  title: string;
  scheduledAt: string;
  status: string;
  course?: { title: string } | null;
}

interface Stats {
  enrolledCourses: number;
  activeSubscriptions: Array<{ accessType: string; subject: { nameAr: string | null; name: string } }>;
  liveNow: number;
  upcoming: number;
  attendanceRate: number | null;
}

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const live = useApiData<{ sessions: LiveRow[] }>('/api/live');
  const stats = useApiData<Stats>('/api/student/stats');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          router.push('/login');
          return;
        }
        setUser(data.data.user);
        setLoading(false);
      })
      .catch(() => router.push('/login'));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <Spinner />
      </div>
    );
  }

  const sessions = live.data?.sessions ?? [];
  const liveNow = sessions.filter((s) => s.status === 'LIVE');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">مرحبًا، {user?.student?.firstName || 'طالب'}</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">إليك نظرة عامة على نشاطك اليوم</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📚" label="الدورات المسجّل بها" value={stats.data?.enrolledCourses ?? '—'} tone="indigo" />
        <StatCard icon="📡" label="حصص مباشرة الآن" value={liveNow.length} tone="red" />
        <StatCard
          icon="✅"
          label="نسبة الحضور"
          value={stats.data?.attendanceRate === null || stats.data?.attendanceRate === undefined ? '—' : `${stats.data.attendanceRate}%`}
          tone="green"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">البث المباشر</h2>
            <Link href="/student/live" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
              عرض الكل
            </Link>
          </div>

          {live.loading ? (
            <Spinner />
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-slate-400">
              <div className="text-4xl mb-3">📡</div>
              <p>لا توجد حصص مباشرة حاليًا</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.slice(0, 4).map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-slate-900/60 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-slate-100 text-sm truncate">{session.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{session.course?.title ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {session.status === 'LIVE' ? (
                      <Badge variant="red">مباشر الآن</Badge>
                    ) : (
                      <Badge variant="gray">مجدولة</Badge>
                    )}
                    <Link
                      href={`/student/live/${session.id}`}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
                    >
                      {session.status === 'LIVE' ? 'انضم' : 'دخول'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">إجراءات سريعة</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { href: '/student/subjects', icon: '📚', label: 'تصفح المواد', color: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
            { href: '/student/videos', icon: '🎬', label: 'الفيديوهات', color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600' },
            { href: '/student/exercises', icon: '✏️', label: 'التمارين', color: 'bg-green-50 dark:bg-emerald-500/10 text-green-600 dark:text-emerald-400' },
            { href: '/student/quizzes', icon: '📝', label: 'الاختبارات', color: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-3 p-5 rounded-xl bg-gray-50 dark:bg-slate-900/60 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl${item.color}`}>
                {item.icon}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{item.label}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
