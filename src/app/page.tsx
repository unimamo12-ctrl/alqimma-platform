'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteShell from '@/components/site-shell';
import { Icon, type IconName } from '@/components/icons';

interface SubjectRow {
  id: string;
  name: string;
  nameAr: string | null;
  icon: string | null;
  color: string | null;
  courseCount: number;
}

interface TeacherRow {
  id: string;
  firstName: string;
  lastName: string;
  bio: string | null;
  avatar: string | null;
  subjects: string[];
  levels: string[];
  isOnline: boolean;
  _count: { courses: number; liveSessions: number };
}

/**
 * These describe capabilities the platform actually has (recorded video, live
 * rooms, exercises, quizzes). They are copy, not records.
 */
const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'video',
    title: 'دروس مسجلة',
    body: 'شاهد الدروس المسجلة في أي وقت وتابع تقدمك من حيث توقفت.',
  },
  {
    icon: 'broadcast',
    title: 'بث مباشر',
    body: 'حصص تفاعلية مع الأستاذ، مع الدردشة ورفع اليد وطرح الأسئلة.',
  },
  {
    icon: 'penLine',
    title: 'تمارين واختبارات',
    body: 'حل التمارين التمارين التفاعلية واستفد من التصحيح التلقائي.',
  },
  {
    icon: 'shield',
    title: 'اشتراكات واضحة',
    body: 'اشترِ الوصول لكل مادة على حدة: بث مباشر، أو فيديوهات، أو تمارين.',
  },
];

export default function HomePage() {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Both endpoints are public and read-only; nothing here is invented.
    Promise.all([
      fetch('/api/subjects').then((r) => r.json()),
      fetch('/api/teachers').then((r) => r.json()),
    ])
      .then(([subjectsJson, teachersJson]) => {
        if (cancelled) return;
        if (subjectsJson.success) setSubjects(subjectsJson.data?.subjects ?? []);
        if (teachersJson.success) setTeachers(teachersJson.data?.teachers ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Real counts, summed from the records the API just returned.
  const totalCourses = teachers.reduce((sum, t) => sum + (t._count?.courses ?? 0), 0);
  const totalLive = teachers.reduce((sum, t) => sum + (t._count?.liveSessions ?? 0), 0);

  const stats = [
    { icon: 'users' as IconName, value: teachers.length, label: 'أستاذ مسجل' },
    { icon: 'book' as IconName, value: subjects.length, label: 'مادة دراسية' },
    { icon: 'layers' as IconName, value: totalCourses, label: 'درس مسجل' },
    { icon: 'broadcast' as IconName, value: totalLive, label: 'حصة مباشرة' },
  ];

  const featuredTeachers = teachers.slice(0, 3);

  return (
    <SiteShell>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-700">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--tw-gradient-stops))] from-indigo-100/70 via-transparent to-transparent"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 dark:bg-slate-900/80 px-4 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 shadow-sm backdrop-blur">
              <Icon name="sparkle" className="h-3.5 w-3.5" />
              منصة تعليمية متكاملة
            </span>

            <h1 className="mt-6 text-4xl font-bold leading-[1.15] tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl lg:text-6xl">
              تعلّم من أي مكان
              <span className="mt-2 block bg-gradient-to-l from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                مع أفضل الأساتذة
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              دروس مسجلة وبث مباشر وتمارين واختبارات، مع أساتذة متخصصين في جميع المواد
              والمستويات. اختر المادة التي تريد واشترك في نوع الوصول الذي يناسبك.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-600/30 sm:w-auto"
              >
                ابدأ التعلم
                <Icon name="chevronLeft" className="h-4 w-4" />
              </Link>
              <Link
                href="/teachers"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-7 py-3.5 text-base font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60 sm:w-auto"
              >
                <Icon name="users" className="h-4 w-4" />
                استكشف الأساتذة
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Real stats */}
      <section className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-4 py-4 transition-colors hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Icon name={stat.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <dd className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {loading ? '—' : stat.value}
                  </dd>
                  <dt className="truncate text-xs text-slate-500 dark:text-slate-400">{stat.label}</dt>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Subjects */}
      <section className="border-b border-slate-200 dark:border-slate-700">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">المواد الدراسية</h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              {loading ? 'جارٍ التحميل...' : 'المواد المتاحة في المنصة حاليًا.'}
            </p>
          </div>

          {loading ? (
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
              ))}
            </div>
          ) : subjects.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-14 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">لا توجد مواد مسجلة بعد.</p>
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {subjects.map((subject) => (
                <Link
                  key={subject.id}
                  href="/teachers"
                  className="group flex flex-col items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg hover:shadow-slate-900/5"
                >
                  <span
                    className="grid h-14 w-14 place-items-center rounded-2xl text-2xl transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: `${subject.color ?? '#4F46E5'}14` }}
                  >
                    {subject.icon ?? '📘'}
                  </span>
                  <span className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {subject.nameAr ?? subject.name}
                  </span>
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {subject.courseCount} {subject.courseCount === 1 ? 'دورة' : 'دورات'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">لماذا منصة القمم؟</h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">تجربة تعليمية متكاملة بأدوات واضحة</p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/5"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                  <Icon name={feature.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-semibold text-slate-900 dark:text-slate-100">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Teachers preview */}
      <section className="border-b border-slate-200 dark:border-slate-700">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">أساتذتنا</h2>
              <p className="mt-3 text-slate-600 dark:text-slate-300">
                {loading ? 'جارٍ التحميل...' : 'أساتذة مسجلون في المنصة حاليًا.'}
              </p>
            </div>
            <Link
              href="/teachers"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60"
            >
              عرض كل الأساتذة
              <Icon name="chevronLeft" className="h-4 w-4" />
            </Link>
          </div>

          {loading ? (
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-56 animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
              ))}
            </div>
          ) : featuredTeachers.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-14 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">لا يوجد أساتذة مسجلون بعد.</p>
            </div>
          ) : (
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {featuredTeachers.map((teacher) => (
                <Link
                  key={teacher.id}
                  href={`/teachers/${teacher.id}`}
                  className="group flex flex-col items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg hover:shadow-slate-900/5"
                >
                  <span className="relative grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-3xl text-white">
                    {teacher.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={teacher.avatar}
                        alt={`${teacher.firstName} ${teacher.lastName}`}
                        className="h-full w-full rounded-2xl object-cover"
                      />
                    ) : (
                      <Icon name="user" className="h-8 w-8" />
                    )}
                    {teacher.isOnline && (
                      <span className="absolute -bottom-1 -left-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </span>

                  <h3 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100 transition-colors group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                    أ. {teacher.firstName} {teacher.lastName}
                  </h3>

                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                    {teacher.subjects.slice(0, 2).map((s) => (
                      <span
                        key={s}
                        className="rounded-lg bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    {teacher._count.courses} درس · {teacher._count.liveSessions} حصة
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Live CTA */}
      <section className="bg-slate-900">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 dark:bg-slate-900/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-200 ring-1 ring-white/15">
            <Icon name="broadcast" className="h-3.5 w-3.5" />
            بث مباشر
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            لا تفوّت أي حصة مباشرة
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300 dark:text-slate-300">
            شاهد كل البثوث المباشرة في المنصة، وانضم إلى الحصة التي تناسبك.
          </p>
          <Link
            href="/live"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white dark:bg-slate-900 px-7 py-3.5 text-base font-semibold text-slate-900 dark:text-slate-100 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 hover:shadow-xl"
          >
            <Icon name="play" className="h-4 w-4" strokeWidth={2} />
            كل البثوث المباشرة
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}