'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteShell from '@/components/site-shell';
import { Icon, type IconName } from '@/components/icons';
import type { SessionUser } from '@/lib/hooks/use-api';

const ROLE_LABEL: Record<string, string> = {
  STUDENT: 'طالب',
  TEACHER: 'أستاذ',
  ADMIN: 'مدير',
};

/**
 * The student's own corner of the platform.
 *
 * `حسابي` in the main menu is the student hub, not a settings screen: these are
 * the real routes that already exist and are already gated per access type, so
 * nothing new had to be created for a student to reach their content.
 */
const STUDENT_AREAS: {
  href: string;
  label: string;
  hint: string;
  icon: IconName;
}[] = [
  {
    href: '/student/subjects',
    label: 'المواد والاشتراكات',
    hint: 'اشترك في بث أو فيديوهات أو تمارين لكل مادة',
    icon: 'book',
  },
  { href: '/student/live', label: 'البث المباشر', hint: 'الحصص المباشرة في موادك', icon: 'broadcast' },
  { href: '/student/videos', label: 'الفيديوهات المسجلة', hint: 'دروس مسجلة متاحة لك', icon: 'video' },
  { href: '/student/exercises', label: 'التمارين', hint: 'تمارين تفاعلية مع التصحيح', icon: 'penLine' },
  { href: '/student/quizzes', label: 'الاختبارات', hint: 'اختبارات مسندة إليك ونتائجها', icon: 'layers' },
  { href: '/student/subscriptions', label: 'اشتراكاتي', hint: 'حالة كل طلب اشتراك', icon: 'shield' },
];

const TEACHER_AREAS: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: '/teacher/live', label: 'البث المباشر', hint: 'إنشاء وإدارة الحصص', icon: 'broadcast' },
  { href: '/teacher/videos', label: 'الفيديوهات', hint: 'إضافة ونشر الدروس', icon: 'video' },
  { href: '/teacher/files', label: 'الملفات', hint: 'ملفاتك التعليمية', icon: 'layers' },
  { href: '/teacher/exercises', label: 'التمارين', hint: 'إنشاء تمارين', icon: 'penLine' },
  { href: '/teacher/quizzes', label: 'الاختبارات', hint: 'إنشاء الاختبارات ونتائجها', icon: 'award' },
  { href: '/teacher/students', label: 'الطلاب', hint: 'قائمة طلابك', icon: 'users' },
  { href: '/teacher/attendance', label: 'الحضور', hint: 'سجل حضور الحصص', icon: 'check' },
  { href: '/teacher/profile', label: 'الملف الشخصي', hint: 'تعديل بياناتك', icon: 'user' },
];

const ADMIN_AREAS: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: '/admin/students', label: 'الطلاب', hint: 'إدارة حسابات الطلاب', icon: 'users' },
  { href: '/admin/teachers', label: 'الأساتذة', hint: 'إدارة حسابات الأساتذة', icon: 'graduation' },
  { href: '/admin/content', label: 'المحتوى', hint: 'الدورات والبثوث', icon: 'book' },
  {
    href: '/admin/subscriptions',
    label: 'الاشتراكات والدفع',
    hint: 'تحقق الدفعات وفعّل الاشتراكات',
    icon: 'shield',
  },
];

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-300" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{value}</dd>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [activeSubs, setActiveSubs] = useState<number | null>(null);

  // Same shape as `useApiData`: every update lands after an await.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const json = await res.json();

        if (cancelled) return;
        if (!json.success) {
          setError('');
          return;
        }

        setUser(json.data.user);

        // Real counts, from endpoints that already exist. A failure here must not
        // take the page down, so each is independent and the tile just omits
        // its number.
        if (json.data.user.role === 'STUDENT') {
          const [subs, live] = await Promise.all([
            fetch('/api/subscriptions/mine', { cache: 'no-store' })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
            fetch('/api/live', { cache: 'no-store' })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ]);

          if (cancelled) return;
          const now = Date.now();
          const active = (subs?.data?.subscriptions ?? []).filter(
            (s: { status: string; endDate: string }) =>
              s.status === 'ACTIVE' && new Date(s.endDate).getTime() > now,
          ).length;
          const liveNow = (live?.data?.sessions ?? []).filter(
            (s: { status: string }) => s.status === 'LIVE',
          ).length;

          setActiveSubs(active);
          setLiveCount(liveNow);
        }
      } catch {
        if (!cancelled) setError('تعذر الاتصال بالخادم');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const profile = user?.student ?? user?.teacher ?? null;
  const fullName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : (user?.email.split('@')[0] ?? '');
  const initial = fullName.charAt(0) || 'م';

  const areas =
    user?.role === 'TEACHER' ? TEACHER_AREAS : user?.role === 'ADMIN' ? ADMIN_AREAS : STUDENT_AREAS;

  const dashboardHref =
    user?.role === 'TEACHER' ? '/teacher' : user?.role === 'ADMIN' ? '/admin' : '/student';

  // Only the student's own numbers are worth surfacing here.
  const counters: Record<string, { value: number | null; unit: string }> =
    user?.role === 'STUDENT'
      ? {
          '/student/subscriptions': { value: activeSubs, unit: 'اشتراك نشط' },
          '/student/live': { value: liveCount, unit: 'مباشر الآن' },
        }
      : {};

  return (
    <SiteShell>
      <section className="border-b border-slate-200 dark:border-slate-700 bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">حسابي</h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">
            {loading
              ? 'جارٍ التحميل...'
              : user
                ? user.role === 'STUDENT'
                  ? 'موادك واشتراكاتك وكل ما يخصك في منصة القمم.'
                  : 'مساحتك في المنصة وروابط speedy.'
                : 'سجّل الدخول لعرض مساحتك.'}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {loading ? (
          <div className="space-y-5">
            <div className="h-48 animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
            <div className="h-64 animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-5 py-4 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : !user ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-16 text-center shadow-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Icon name="user" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">لم تسجّل الدخول بعد</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              سجّل الدخول لعرض موادك واشتراكاتك ومحتواك.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 hover:shadow-md"
              >
                <Icon name="login" className="h-4 w-4" />
                تسجيل الدخول
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60"
              >
                إنشاء حساب
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Identity */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <div className="h-20 bg-gradient-to-l from-indigo-600 via-indigo-500 to-violet-500" />
              <div className="px-6 pb-6">
                <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
                  <div className="flex items-end gap-4">
                    <span className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-bold text-white ring-4 ring-white">
                      {initial}
                    </span>
                    <div className="pb-1">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{fullName}</h2>
                      <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    <Link
                      href={dashboardHref}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60"
                    >
                      <Icon name="layers" className="h-4 w-4" />
                      لوحة التحكم
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:border-rose-200 dark:hover:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Icon name="logout" className="h-4 w-4" />
                      تسجيل الخروج
                    </button>
                  </div>
                </div>

                <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoRow icon="mail" label="البريد الإلكتروني" value={<span dir="ltr">{user.email}</span>} />
                  {user.student?.level && (
                    <InfoRow icon="graduation" label="المستوى" value={user.student.level} />
                  )}
                  {user.student?.class && (
                    <InfoRow icon="users" label="القسم" value={user.student.class} />
                  )}
                  {user.student?.phone && (
                    <InfoRow icon="phone" label="الهاتف" value={<span dir="ltr">{user.student.phone}</span>} />
                  )}
                  <InfoRow
                    icon="shield"
                    label="الحالة"
                    value={user.status === 'ACTIVE' ? 'نشط' : user.status}
                  />
                </dl>
              </div>
            </div>

            {/* The student's world / teacher's world / admin world */}
            <div>
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">
                {user.role === 'STUDENT' ? 'كل ما يخصك' : user.role === 'ADMIN' ? 'أدوات الإدارة' : 'مساحتك'}
              </h2>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {areas.map((area) => {
                  const counter = counters[area.href];
                  return (
                    <Link
                      key={area.href}
                      href={area.href}
                      className="group flex items-start gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg hover:shadow-slate-900/5"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                        <Icon name={area.icon} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 transition-colors group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                          {area.label}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{area.hint}</p>
                        {counter && counter.value !== null && (
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            {counter.value} {counter.unit}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </SiteShell>
  );
}