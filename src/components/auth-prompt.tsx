'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';

const PERKS: { icon: IconName; text: string }[] = [
  { icon: 'broadcast', text: 'الدخول إلى كل البثوث المباشرة في موادك' },
  { icon: 'video', text: 'مشاهدة الدروس المسجلة وتحميل الملفات' },
  { icon: 'penLine', text: 'حل التمارين والاختبارات مع التصحيح' },
  { icon: 'shield', text: 'إدارة اشتراكاتك وموادك من مكان واحد' },
];

/**
 * Shown instead of navigating when a signed-out visitor picks a menu that needs
 * an account. It is deliberately a dialog rather than a redirect: bouncing to
 * /login and back loses the page the visitor was trying to reach, and a
 * redirect also makes the back button feel broken.
 */
export default function AuthPrompt({
  onClose,
  reason,
}: {
  onClose: () => void;
  /** The menu label they tried to open, so the prompt explains itself. */
  reason?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-prompt-title"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
      >
        <div className="relative bg-gradient-to-l from-indigo-600 via-indigo-500 to-violet-500 px-6 py-7 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="absolute left-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/15 dark:hover:bg-slate-900/15 hover:text-white"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>

          <span className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-white/15 dark:bg-slate-900/15 backdrop-blur-sm">
            <Icon name="user" className="h-6 w-6" />
          </span>
          <h2 id="auth-prompt-title" className="mt-4 text-xl font-bold">
            {reason ? `للمتابعة إلى «${reason}»` : 'سجّل الدخول للمتابعة'}
          </h2>
          <p className="mt-1.5 text-sm text-indigo-100">
            تحتاج إلى حساب في منصة القمم للوصول إلى هذه الصفحة.
          </p>
        </div>

        <div className="px-6 py-6">
          <ul className="space-y-3">
            {PERKS.map((perk) => (
              <li key={perk.text} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Icon name={perk.icon} className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{perk.text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 space-y-2.5">
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 hover:shadow-md"
            >
              <Icon name="login" className="h-4 w-4" />
              تسجيل الدخول
            </Link>
            <Link
              href="/register"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60"
            >
              <Icon name="graduation" className="h-4 w-4" />
              إنشاء حساب جديد
            </Link>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full text-center text-xs text-slate-400 dark:text-slate-300 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
          >
            متابعة التصفح بدون حساب
          </button>
        </div>
      </div>
    </div>
  );
}