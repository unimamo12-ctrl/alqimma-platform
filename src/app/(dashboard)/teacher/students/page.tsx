'use client';

import { useCallback, useEffect, useState } from 'react';
import { TeacherShell, useProfileLoader } from '../_components/shell';

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  level: string | null;
  class: string | null;
  createdAt: string;
}

export default function TeacherStudentsPage() {
  const { loading: profileLoading } = useProfileLoader();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (query: string) => {
    try {
      const res = await fetch(
        `/api/teacher/students${query ? `?search=${encodeURIComponent(query)}` : ''}`,
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || 'تعذر تحميل الطلاب');
        return;
      }

      setStudents(data.data.students ?? []);
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(search), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  if (profileLoading) {
    return (
      <TeacherShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">الطلاب</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم..."
            className="w-full sm:w-72 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700">
            <p className="text-gray-500 dark:text-slate-400">لا يوجد طلاب مطابقون</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((student) => (
              <div
                key={student.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold">
                    {student.firstName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-slate-100">
                      {student.firstName} {student.lastName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {student.level ?? '-'} {student.class ? `/ ${student.class}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
