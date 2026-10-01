'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Stats {
  totalStudents: number;
  totalTeachers: number;
  totalSubjects: number;
  totalVideos: number;
  totalFiles: number;
  totalLiveSessions: number;
  totalSubscriptions: number;
  totalPayments: number;
  activeStudents: number;
  activeTeachers: number;
  totalRevenue: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || data.data.user.role !== 'ADMIN') {
          router.push('/login');
          return;
        }
        setLoading(false);
      })
      .catch(() => router.push('/login'));
  }, [router]);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStats(data.data.stats);
        }
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">لوحة تحكم الإدارة</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">نظرة عامة على المنصة</p>
        </div>
      </div>
          {stats && (
            <div className="grid md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/15 rounded-xl flex items-center justify-center text-2xl">
                    👨‍🎓
                  </div>
                  <span className="text-sm text-gray-500 dark:text-slate-400">{stats.activeStudents} نشط</span>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-1">{stats.totalStudents}</div>
                <div className="text-gray-600 dark:text-slate-400">الطلاب</div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-500/15 rounded-xl flex items-center justify-center text-2xl">
                    👨‍🏫
                  </div>
                  <span className="text-sm text-gray-500 dark:text-slate-400">{stats.activeTeachers} نشط</span>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-1">{stats.totalTeachers}</div>
                <div className="text-gray-600 dark:text-slate-400">الأساتذة</div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-green-100 dark:bg-emerald-500/15 rounded-xl flex items-center justify-center text-2xl">
                    📚
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-1">{stats.totalVideos}</div>
                <div className="text-gray-600 dark:text-slate-400">الفيديوهات</div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-500/15 rounded-xl flex items-center justify-center text-2xl">
                    💰
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-1">
                  {stats.totalRevenue.toLocaleString()} دج
                </div>
                <div className="text-gray-600 dark:text-slate-400">الإيرادات</div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-4">إجراءات سريعة</h2>
              <div className="space-y-3">
                <Link
                  href="/admin/students"
                  className="block p-4 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 rounded-xl transition-colors"
                >
                  <div className="font-medium text-indigo-900 dark:text-indigo-200">إدارة الطلاب</div>
                  <div className="text-sm text-indigo-600 dark:text-indigo-400">إضافة، تعديل، حذف الطلاب</div>
                </Link>
                <Link
                  href="/admin/teachers"
                  className="block p-4 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/15 rounded-xl transition-colors"
                >
                  <div className="font-medium text-purple-900 dark:text-purple-200">إدارة الأساتذة</div>
                  <div className="text-sm text-purple-600">إضافة، تعديل، حذف الأساتذة</div>
                </Link>
                <Link
                  href="/admin/content"
                  className="block p-4 bg-green-50 dark:bg-emerald-500/10 hover:bg-green-100 dark:hover:bg-emerald-500/15 rounded-xl transition-colors"
                >
                  <div className="font-medium text-green-900 dark:text-emerald-200">إدارة المحتوى</div>
                  <div className="text-sm text-green-600 dark:text-emerald-400">الفيديوهات، الملفات، التمارين</div>
                </Link>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-4">إحصائيات سريعة</h2>
              {stats ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl">
                    <span className="text-gray-600 dark:text-slate-400">المواد الدراسية</span>
                    <span className="font-semibold text-gray-900 dark:text-slate-100">{stats.totalSubjects}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl">
                    <span className="text-gray-600 dark:text-slate-400">الملفات</span>
                    <span className="font-semibold text-gray-900 dark:text-slate-100">{stats.totalFiles}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl">
                    <span className="text-gray-600 dark:text-slate-400">البث المباشر</span>
                    <span className="font-semibold text-gray-900 dark:text-slate-100">{stats.totalLiveSessions}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl">
                    <span className="text-gray-600 dark:text-slate-400">الاشتراكات</span>
                    <span className="font-semibold text-gray-900 dark:text-slate-100">{stats.totalSubscriptions}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl">
                    <span className="text-gray-600 dark:text-slate-400">المدفوعات</span>
                    <span className="font-semibold text-gray-900 dark:text-slate-100">{stats.totalPayments}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                  <div className="text-5xl mb-4">📊</div>
                  <p>جاري تحميل الإحصائيات...</p>
                </div>
              )}
            </div>
          </div>
    </>
  );
}
