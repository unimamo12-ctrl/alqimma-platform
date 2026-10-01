'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SiteNav from '@/components/site-nav';
import { Icon, type IconName } from '@/components/icons';

interface RoleLink {
  href: string;
  label: string;
  /** Named from the shared icon set, not an emoji. */
  icon: IconName;
  badge?: number;
}

// Not named `use*` on purpose: it runs inside a `.map()`, and the hooks lint
// would read a `use` prefix as a hook call in a callback.
function isActiveRoute(href: string, pathname: string) {
  if (href === '/' ) return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Dashboard shell.
 *
 * The role sidebar was replaced with a horizontal bar to match the new site
 * navbar. The role links are kept as a second row rather than dropped: they are
 * the only way to reach routes such as /admin/subscriptions and
 * /teacher/quizzes, so removing them would strand those pages.
 */
export default function DashboardLayout({
  children,
  title,
  sidebarItems,
  headerActions,
}: {
  children: React.ReactNode;
  title: string;
  sidebarItems: RoleLink[];
  headerActions?: React.ReactNode;
  // accepted for call-site compatibility; the identity chip lives in SiteNav now
  user?: { firstName: string; lastName: string; role: string } | null;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-800/60">
      <SiteNav />

      {/* Secondary role navigation */}
      <div className="sticky top-16 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <nav
              aria-label="أقسام اللوحة"
              className="flex flex-1 items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {sidebarItems.map((item) => {
                const active = isActiveRoute(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon
                      name={item.icon}
                      className={`h-4 w-4 ${
                        active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                      }`}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {headerActions}
          </div>
        </div>
      </div>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <h1 className="sr-only">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
