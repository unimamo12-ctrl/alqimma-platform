'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/hooks/use-api';
import Link from 'next/link';

interface Video {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  duration: number;
  views: number;
  isPublished: boolean;
  createdAt: string;
  course: {
    id: string;
    title: string;
  };
}

interface Stats {
  totalCourses: number;
  totalVideos: number;
  totalStudents: number;
  totalLiveSessions: number;
  totalFiles: number;
  totalExercises: number;
  attendanceRecords: number;
  totalMinutes: number;
}

const EMPTY_STATS: Stats = {
  totalCourses: 0,
  totalVideos: 0,
  totalStudents: 0,
  totalLiveSessions: 0,
  totalFiles: 0,
  totalExercises: 0,
  attendanceRecords: 0,
  totalMinutes: 0,
};


export default function TeacherDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (user?.teacher?.id) {
      fetch(`/api/videos?teacherId=${user.teacher.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setVideos(data.data.videos);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'TEACHER') return;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/teacher/stats');
        const data = await res.json();

        if (cancelled) return;

        if (res.ok && data.success) {
          setStats({ ...EMPTY_STATS, ...data.data.stats });
        }
      } catch {
        /* silently keep zeros */
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user]);


  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // mirrors TeacherShell's LINKS: this page has its own sidebar, so anything
  // missing here is simply unreachable from the teacher dashboard
  const menuItems = [
{ href: '/teacher', label: 'لوحة التحكم', icon: '📊' },
  { href: '/teacher/courses', label: 'دوراتي', icon: '📘' },
  { href: '/teacher/videos', label: 'الفيديوهات', icon: '🎥' },
    { href: '/teacher/files', label: 'الملفات', icon: '📎' },
    { href: '/teacher/exercises', label: 'التمارين', icon: '✏️' },
    { href: '/teacher/quizzes', label: 'الاختبارات', icon: '📝' },
    { href: '/teacher/live', label: 'البث المباشر', icon: '📡' },
    { href: '/teacher/attendance', label: 'الحضور', icon: '🗓️' },
    { href: '/teacher/students', label: 'الطلاب', icon: '👥' },
    { href: '/teacher/profile', label: 'الملف الشخصي', icon: '👤' },
    { href: '/teacher/settings', label: 'الإعدادات', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60 flex">
      <aside className="w-64 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 fixed h-full overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-slate-100">منصة القمم</span>
          </div>

          <nav className="space-y-1">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors"
              >
                <span>{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 mr-64">
        <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-40">
          <div className="flex items-center justify-between h-16 px-8">
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">لوحة تحكم الأستاذ</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-600 dark:text-slate-400">مرحبًا، أ. {user?.teacher?.firstName || 'أستاذ'}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 font-medium transition-colors"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </header>

        <div className="p-8">
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">{stats.totalVideos}</div>
              <div className="text-gray-600 dark:text-slate-400">الفيديوهات</div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-purple-600 mb-2">{stats.totalStudents}</div>
              <div className="text-gray-600 dark:text-slate-400">الطلاب</div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-green-600 dark:text-emerald-400 mb-2">{stats.totalLiveSessions}</div>
              <div className="text-gray-600 dark:text-slate-400">البث المباشر</div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-orange-600 mb-2">{stats.totalFiles}</div>
              <div className="text-gray-600 dark:text-slate-400">الملفات</div>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-cyan-600 mb-2">{stats.totalCourses}</div>
              <div className="text-gray-600 dark:text-slate-400">الدورات</div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-teal-600 mb-2">{stats.totalExercises}</div>
              <div className="text-gray-600 dark:text-slate-400">التمارين</div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-pink-600 mb-2">{stats.attendanceRecords}</div>
              <div className="text-gray-600 dark:text-slate-400">سجلات الحضور</div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-amber-600 mb-2">{stats.totalMinutes}</div>
              <div className="text-gray-600 dark:text-slate-400">دقائق الحضور</div>
            </div>
          </div>


          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-4">إجراءات سريعة</h2>
              <div className="space-y-3">
                <Link
                  href="/teacher/quizzes/new"
                  className="block p-4 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 rounded-xl transition-colors"
                >
                  <div className="font-medium text-emerald-900">إضافة اختبار جديد</div>
                  <div className="text-sm text-emerald-600">
                    إنشاء اختبار، إضافة الأسئلة، ثم إسناده للتلاميذ
                  </div>
                </Link>
                <Link
                  href="/teacher/videos"
                  className="block p-4 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 rounded-xl transition-colors"
                >
                  <div className="font-medium text-indigo-900 dark:text-indigo-200">إضافة فيديو جديد</div>
                  <div className="text-sm text-indigo-600 dark:text-indigo-400">رفع فيديو جديد للدروس</div>
                </Link>
                <Link
                  href="/teacher/live"
                  className="block p-4 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/15 rounded-xl transition-colors"
                >
                  <div className="font-medium text-purple-900 dark:text-purple-200">إنشاء بث مباشر</div>
                  <div className="text-sm text-purple-600">جدولة حصة مباشرة</div>
                </Link>
                <Link
                  href="/teacher/students"
                  className="block p-4 bg-green-50 dark:bg-emerald-500/10 hover:bg-green-100 dark:hover:bg-emerald-500/15 rounded-xl transition-colors"
                >
                  <div className="font-medium text-green-900 dark:text-emerald-200">عرض الطلاب</div>
                  <div className="text-sm text-green-600 dark:text-emerald-400">إدارة الطلاب المسجلين</div>
                </Link>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-4">آخر الفيديوهات</h2>
              {videos.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                  <div className="text-5xl mb-4">🎥</div>
                  <p>لا توجد فيديوهات حاليًا</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {videos.slice(0, 5).map((video) => (
                    <div
                      key={video.id}
                      className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl"
                    >
                      <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/15 rounded-lg flex items-center justify-center text-xl">
                        🎬
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-slate-100 truncate">{video.title}</div>
                        <div className="text-sm text-gray-500 dark:text-slate-400">{video.course.title}</div>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-slate-400">{video.views} مشاهدة</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
