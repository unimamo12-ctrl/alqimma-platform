'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BrandMark, Icon, type IconName } from '@/components/icons';
import AuthPrompt from '@/components/auth-prompt';
import AdminAccessDialog from '@/components/admin-access-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { useTheme } from '@/components/theme-provider';
import { useApiData, type SessionUser } from '@/lib/hooks/use-api';

/**
 * The four main menus. Nothing else belongs here — the role dashboards keep
 * their own secondary row, so this stays a short, scannable list.
 */
const MAIN_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'الرئيسية', icon: 'home' },
  { href: '/teachers', label: 'الأساتذة', icon: 'users' },
  { href: '/live', label: 'كل البثوث المباشرة', icon: 'broadcast' },
  { href: '/account', label: 'حسابي', icon: 'user' },
];

/**
 * Menus that need an account.
 *
 * `الرئيسية` is open on purpose: it is the platform front door and the visitor
 * needs somewhere to land. Everything else resolves to a student-owned page, so
 * a signed-out click is intercepted and turned into a prompt instead of a
 * navigation. The pages themselves still render if opened directly — the
 * navbar is the only thing enforcing this, which keeps the guard out of the
 * API and means it cannot lock anyone out of real data.
 */
const REQUIRES_ACCOUNT = new Set(['/teachers', '/live', '/account']);

// Deliberately not named `use*`: it is called inside a `.map()`, and the
// rules-of-hooks lint would treat a `use` prefix as a hook call in a callback.
function isActiveRoute(href: string, pathname: string) {
  // `/` must match exactly or every route would highlight it, since every
  // pathname starts with a slash.
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useApiData<{ user: SessionUser }>('/api/auth/me');
  const user = data?.user ?? null;

  const [open, setOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const isDarkTheme = theme === 'dark';
  const [scrolled, setScrolled] = useState(false);
  const [gate, setGate] = useState<string | null>(null);

  /**
   * Intercept a menu click that needs an account. Returning without calling
   * `preventDefault` lets the navigation proceed, so signed-in users and
   * `الرئيسية` are completely unaffected by this branch.
   */
  function handleMenuClick(
    event: React.MouseEvent,
    href: string,
    label: string,
  ) {
    if (user || !REQUIRES_ACCOUNT.has(href)) return;
    event.preventDefault();
    // Close the drawer too: leaving it open under the dialog stacks two
    // overlays and traps the scroll lock that both of them install.
    setOpen(false);
    setGate(label);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /*
   * The drawer used to be closed by watching `pathname` in an effect, which
   * setState during render commit and tripped the set-state-in-effect rule.
   * Closing on click instead is both simpler and more correct: every drawer
   * link goes through `closeAndFollow`, so a tap always dismisses it, and the
   * browser back button is covered by the same handler because a route change
   * unmounts nothing here but the drawer is never left over a new page.
   */
  const closeAndFollow = () => setOpen(false);

  // Stop the page scrolling behind the open drawer.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setOpen(false);
    router.push('/login');
  }

  const dashboardHref =
    user?.role === 'TEACHER' ? '/teacher' : user?.role === 'ADMIN' ? '/admin' : '/student';

  const fullName = user
    ? `${user.student?.firstName ?? user.teacher?.firstName ?? ''} ${
        user.student?.lastName ?? user.teacher?.lastName ?? ''
      }`.trim()
    : '';

  const roleLabel =
    user?.role === 'TEACHER' ? 'أستاذ' : user?.role === 'ADMIN' ? 'مدير' : 'طالب';

  return (
    <>
      <header
        className={`sticky top-0 z-50 border-b bg-white/85 dark:bg-slate-900/85 dark:bg-slate-950/85 backdrop-blur-xl transition-shadow duration-300${
          scrolled ? 'border-slate-200/80 shadow-sm shadow-slate-900/5' : 'border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="منصة القمم">
            <BrandMark />
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">منصة القمم</span>
          </Link>

          {/* Desktop menus */}
          <nav className="mx-auto hidden items-center gap-1 lg:flex">
            {MAIN_LINKS.map((link) => {
              const active = isActiveRoute(link.href, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={(event) => handleMenuClick(event, link.href, link.label)}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors duration-200${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon
                    name={link.icon}
                    className={`h-[18px] w-[18px] transition-colors ${
                      active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                    }`}
                  />
                  {link.label}
                </Link>
              );
            })}
          </nav>

<div className="mr-auto hidden items-center gap-2 lg:flex">
            {/* Reachable signed out or signed in: an admin gets in from here
                without hunting for the login form. */}
            <AdminAccessDialog />

            <ThemeToggle />

            {user ? (
              <>
                <Link
                  href={dashboardHref}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60"
                >
                  لوحة {roleLabel === 'أستاذ' ? 'الأستاذ' : roleLabel === 'مدير' ? 'الإدارة' : 'الطالب'}
                </Link>
                <Link
                  href="/account"
                  className="flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-3 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
                    {fullName.charAt(0) || 'م'}
                  </span>
                  <span className="max-w-[9rem] truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {fullName}
                  </span>
                </Link>

                {/* Desktop sign-out. Without this the only way out was the mobile
                    drawer or the /account page, which is a trap on desktop. */}
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="تسجيل الخروج"
                  title="تسجيل الخروج"
                  className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 dark:text-slate-400 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  <Icon name="logout" className="h-[18px] w-[18px]" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  تسجيل الدخول
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 hover:shadow-md hover:shadow-indigo-600/30"
                >
                  إنشاء حساب
                </Link>
              </>
            )}
          </div>

          {/* Mobile trigger */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="فتح القائمة"
            aria-expanded={open}
            className="mr-auto grid h-10 w-10 place-items-center rounded-xl text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer — same four menus, nothing added */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <Link href="/" className="flex items-center gap-2.5">
                <BrandMark />
                <span className="text-base font-bold text-slate-900 dark:text-slate-100">منصة القمم</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق القائمة"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
              {MAIN_LINKS.map((link) => {
                const active = isActiveRoute(link.href, pathname);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={(event) => handleMenuClick(event, link.href, link.label)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon
                      name={link.icon}
                      className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}
                    />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-slate-100 dark:border-slate-800 p-4">
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
                      {fullName.charAt(0) || 'م'}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{fullName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel}</p>
                    </div>
                  </div>
                  <Link
                    href={dashboardHref}
                    onClick={closeAndFollow}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <Icon name="layers" className="h-4 w-4" />
                    لوحة التحكم
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:border-red-200 dark:hover:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Icon name="logout" className="h-4 w-4" />
                    تسجيل الخروج
                  </button>

                  {/* The toggle is only in the desktop bar otherwise, so a phone
                      user had no way to reach it. */}
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Icon name={isDarkTheme ? 'sun' : 'moon'} className="h-4 w-4" />
                    {isDarkTheme ? 'الوضع النهاري' : 'الوضع الليلي'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link
                    href="/login"
                    onClick={closeAndFollow}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <Icon name="login" className="h-4 w-4" />
                    تسجيل الدخول
                  </Link>
                  <Link
                    href="/register"
                    onClick={closeAndFollow}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60"
                  >
                    إنشاء حساب
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {gate && <AuthPrompt reason={gate} onClose={() => setGate(null)} />}
    </>
  );
}
