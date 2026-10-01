'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell, useAdminGuard, Loading } from '../_components/shell';
import { useApiData } from '@/lib/hooks/use-api';

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  level: string | null;
  class: string | null;
  user: {
    email: string;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
  };
  subscriptions: Array<{ id: string; status: string; subject: { nameAr: string | null; name: string } }>;
}

export default function AdminStudentsPage() {
  const ready = useAdminGuard();
  const { data, error, loading } = useApiData<{ students: StudentRow[] }>(
    '/api/admin/students',
    ready,
  );
  const [search, setSearch] = useState('');

  const students = useMemo(() => data?.students ?? [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (s) =>
        s.firstName.toLowerCase().includes(term) ||
        s.lastName.toLowerCase().includes(term) ||
        s.user.email.toLowerCase().includes(term),
    );
  }, [students, search]);

  if (!ready) return <AdminShell><Loading /></AdminShell>;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
            الطلاب <span className="text-sm font-normal text-gray-500 dark:text-slate-400">({filtered.length})</span>
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
            <p className="text-gray-500 dark:text-slate-400">لا يوجد طلاب</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                <tr>
                  <th className="text-right font-medium px-4 py-3">الاسم</th>
                  <th className="text-right font-medium px-4 py-3">البريد</th>
                  <th className="text-right font-medium px-4 py-3">المستوى</th>
                  <th className="text-right font-medium px-4 py-3">الهاتف</th>
                  <th className="text-right font-medium px-4 py-3">الاشتراك</th>
                  <th className="text-right font-medium px-4 py-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-gray-900 dark:text-slate-100">
                      <Link
                        href={`/admin/students/${s.id}`}
                        className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                      >
                        {s.firstName} {s.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400" dir="ltr">
                      {s.user.email}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                      {s.level ?? '-'} {s.class ? `/ ${s.class}` : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400" dir="ltr">
                      {s.phone ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                      {s.subscriptions?.length
                        ? s.subscriptions
                            .filter((sub) => sub.status === 'ACTIVE')
                            .map((sub) => sub.subject.nameAr ?? sub.subject.name)
                            .join('، ')
                        : 'لا يوجد'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full${
                          s.user.status === 'ACTIVE'
                            ? 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        {s.user.status === 'ACTIVE' ? 'نشط' : s.user.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
