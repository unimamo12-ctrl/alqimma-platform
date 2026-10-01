import Link from 'next/link';
import SiteNav from '@/components/site-nav';
import { BrandMark, Icon, type IconName } from '@/components/icons';

const FOOTER_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'الرئيسية', icon: 'home' },
  { href: '/teachers', label: 'الأساتذة', icon: 'users' },
  { href: '/live', label: 'كل البثوث المباشرة', icon: 'broadcast' },
  { href: '/account', label: 'حسابي', icon: 'user' },
];

/**
 * Shell for the public pages.
 *
 * Every link here is a real route. The previous footer carried `href="#"`
 * placeholders for help/support/contact pages that do not exist, so those
 * columns were removed rather than re-pointed at nothing.
 */
export default function SiteShell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-800/60">
      <SiteNav />
      <main className={`flex-1 ${className}`}>{children}</main>

      <footer className="mt-auto border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark />
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">منصة القمم</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                منصة تعليمية متكاملة للدروس الداعمة عن بُعد: دروس مسجلة، بث مباشر، تمارين
                واختبارات مع أساتذة متخصصين.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">روابط سريعة</h3>
              <ul className="mt-4 space-y-2.5">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      <Icon
                        name={link.icon}
                        className="h-4 w-4 text-slate-300 dark:text-slate-300 transition-colors group-hover:text-indigo-500"
                      />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">الدخول</h3>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <Link
                    href="/login"
                    className="group inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    <Icon name="login" className="h-4 w-4 text-slate-300 dark:text-slate-300 transition-colors group-hover:text-indigo-500" />
                    تسجيل الدخول
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register"
                    className="group inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    <Icon name="graduation" className="h-4 w-4 text-slate-300 dark:text-slate-300 transition-colors group-hover:text-indigo-500" />
                    إنشاء حساب
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-100 dark:border-slate-800 pt-6 text-center text-xs text-slate-400 dark:text-slate-300">
            <p>© {new Date().getFullYear()} منصة القمم للدراسة عن بُعد. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}