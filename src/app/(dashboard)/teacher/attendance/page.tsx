'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useApiData } from '@/lib/hooks/use-api';

interface AttendanceRow {
  id: string;
  joinTime: string;
  leaveTime: string | null;
  duration: number;
  student: { id: string; firstName: string; lastName: string };
  session: { id: string; title: string; scheduledAt: string };
}

export default function TeacherAttendancePage() {
  const { data, error, loading } = useApiData<{ attendance: AttendanceRow[] }>(
    '/api/attendance',
  );
  const rows = useMemo(() => data?.attendance ?? [], [data]);

  const totalMinutes = useMemo(
    () => rows.reduce((sum, r) => sum + (r.duration || 0), 0),
    [rows],
  );
  const uniqueStudents = useMemo(() => new Set(rows.map((r) => r.student.id)).size, [rows]);

  useEffect(() => {
    // no-op to satisfy hooks
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60" dir="rtl">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">سجل الحضور</h1>
          <Link
            href="/teacher"
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
          >
            العودة للوحة التحكم
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="إجمالي سجلات الحضور" value={rows.length} />
          <Stat label="عدد الطلاب الحاضرين" value={uniqueStudents} />
          <Stat label="إجمالي دقائق الحضور" value={totalMinutes} />
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700">
            <p className="text-gray-500 dark:text-slate-400">لا يوجد سجلات حضور بعد</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                <tr>
                  <th className="text-right font-medium px-4 py-3">الطالب</th>
                  <th className="text-right font-medium px-4 py-3">الحصة</th>
                  <th className="text-right font-medium px-4 py-3">وقت الدخول</th>
                  <th className="text-right font-medium px-4 py-3">وقت الخروج</th>
                  <th className="text-right font-medium px-4 py-3">المدة (دقيقة)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-gray-900 dark:text-slate-100">
                      {row.student.firstName} {row.student.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{row.session.title}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400" dir="ltr">
                      {row.joinTime ? new Date(row.joinTime).toLocaleTimeString('ar-DZ') : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400" dir="ltr">
                      {row.leaveTime ? new Date(row.leaveTime).toLocaleTimeString('ar-DZ') : 'لم يخرج'}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-slate-100">{row.duration || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
