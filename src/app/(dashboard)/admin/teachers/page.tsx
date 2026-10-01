'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell, useAdminGuard, Loading } from '../_components/shell';
import { useApiData } from '@/lib/hooks/use-api';

interface TeacherRow {
  id: string;
  firstName: string;
  lastName: string;
  bio: string | null;
  subjects: string[];
  levels: string[];
  isOnline: boolean;
  user: {
    email: string;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
  };
  _count?: { courses: number; liveSessions: number };
}

export default function AdminTeachersPage() {
  const ready = useAdminGuard();
  const { data, error, loading } = useApiData<{ teachers: TeacherRow[] }>(
    '/api/admin/teachers',
    ready,
  );
  const [search, setSearch] = useState('');

  const teachers = useMemo(() => data?.teachers ?? [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return teachers;
    return teachers.filter(
      (t) =>
        t.firstName.toLowerCase().includes(term) ||
        t.lastName.toLowerCase().includes(term) ||
        t.user.email.toLowerCase().includes(term),
    );
  }, [teachers, search]);

  if (!ready) return <AdminShell><Loading /></AdminShell>;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
            الأساتذة <span className="text-sm font-normal text-gray-500 dark:text-slate-400">({filtered.length})</span>
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو البريد..."
            className="w-full sm:w-72 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700">
            <p className="text-gray-500 dark:text-slate-400">لا يوجد أساتذة</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((t) => (
              <div key={t.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold">
                      {t.firstName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-slate-100">
                        <Link
                          href={`/admin/teachers/${t.id}`}
                          className="text-indigo-600 dark:text-indigo-400 transition-colors hover:text-indigo-700 dark:hover:text-indigo-300"
                        >
                          {t.firstName} {t.lastName}
                        </Link>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400" dir="ltr">
                        {t.user.email}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full${
                      t.isOnline
                        ? 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
                    }`}
                  >
                    {t.isOnline ? 'متصل' : 'غير متصل'}
                  </span>
                </div>

                {t.bio && <p className="text-sm text-gray-600 dark:text-slate-400 mb-3 line-clamp-2">{t.bio}</p>}

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {t.subjects.map((s) => (
                    <span
                      key={s}
                      className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
                  <span>الدورات: {t._count?.courses ?? 0}</span>
                  <span>البثوث: {t._count?.liveSessions ?? 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
