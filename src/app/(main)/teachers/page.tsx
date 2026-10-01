'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SiteShell from '@/components/site-shell';
import { Icon } from '@/components/icons';

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  bio: string | null;
  avatar: string | null;
  subjects: string[];
  levels: string[];
  isOnline: boolean;
  _count: {
    courses: number;
    liveSessions: number;
  };
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/teachers')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setTeachers(json.data.teachers);
        else setError(json.message || 'تعذر تحميل الأساتذة');
      })
      .catch(() => {
        if (!cancelled) setError('تعذر الاتصال بالخادم');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allSubjects = useMemo(
    () => [...new Set(teachers.flatMap((t) => t.subjects))].sort(),
    [teachers],
  );

  const filteredTeachers = useMemo(() => {
    const term = search.trim();
    return teachers.filter((teacher) => {
      const matchesSearch =
        !term ||
        teacher.firstName.includes(term) ||
        teacher.lastName.includes(term) ||
        teacher.subjects.some((s) => s.includes(term));
      const matchesSubject = !selectedSubject || teacher.subjects.includes(selectedSubject);
      return matchesSearch && matchesSubject;
    });
  }, [teachers, search, selectedSubject]);

  return (
    <SiteShell>
      <section className="border-b border-slate-200 dark:border-slate-700 bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-100">
            <Icon name="users" className="h-3.5 w-3.5" />
            الأساتذة
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            أساتذتنا
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
            {loading
              ? 'جارٍ التحميل...'
              : `${teachers.length} أستاذ مسجل في المنصة. اختر الأستاذ لعرض ملفه الكامل.`}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Filters */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-300"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو المادة..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-3 pr-11 pl-4 text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-300 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 shadow-sm outline-none transition-all focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="">جميع المواد</option>
            {allSubjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-5 py-4 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-16 text-center shadow-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-300">
              <Icon name="users" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {teachers.length === 0 ? 'لا يوجد أساتذة' : 'لا توجد نتائج مطابقة'}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {teachers.length === 0
                ? 'لم يتم تسجيل أي أستاذ بعد.'
                : 'جرّب تعديل كلمة البحث أو اختيار مادة أخرى.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredTeachers.map((teacher) => (
              <Link
                key={teacher.id}
                href={`/teachers/${teacher.id}`}
                className="group flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-xl hover:shadow-slate-900/5"
              >
                <div className="flex items-start gap-4">
                  <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                    {teacher.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={teacher.avatar}
                        alt={`${teacher.firstName} ${teacher.lastName}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Icon name="user" className="h-7 w-7" />
                    )}
                    {teacher.isOnline && (
                      <span className="absolute -bottom-1 -left-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold text-slate-900 dark:text-slate-100 transition-colors group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                      أ. {teacher.firstName} {teacher.lastName}
                    </h2>
                    <span
                      className={`mt-1.5 inline-flex items-center gap-1.5 text-xs${
                        teacher.isOnline ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          teacher.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                      {teacher.isOnline ? 'متصل الآن' : 'غير متصل'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {teacher.subjects.slice(0, 3).map((subject) => (
                    <span
                      key={subject}
                      className="rounded-lg bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300"
                    >
                      {subject}
                    </span>
                  ))}
                  {teacher.subjects.length > 3 && (
                    <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      +{teacher.subjects.length - 3}
                    </span>
                  )}
                </div>

                {teacher.bio && (
                  <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {teacher.bio}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="layers" className="h-3.5 w-3.5 text-slate-400 dark:text-slate-300" />
                    {teacher._count.courses} درس
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="broadcast" className="h-3.5 w-3.5 text-slate-400 dark:text-slate-300" />
                    {teacher._count.liveSessions} حصة
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    الملف
                    <Icon name="chevronLeft" className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}