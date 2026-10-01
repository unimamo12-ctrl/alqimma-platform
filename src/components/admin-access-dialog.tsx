'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';

/**
 * Password-only door into the admin panel.
 *
 * The password is matched against ADMIN accounts server-side, so a teacher or a
 * student typing their own password is refused rather than silently upgraded.
 * The field asks for one thing because that is what was asked for; the security
 * of it lives in `/api/admin/panel-access`, not in hiding the email field.
 */
export default function AdminAccessDialog() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setPassword('');
    setError('');
    setOpen(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;

    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/admin/panel-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'تعذر الدخول');
        return;
      }

      close();
      // A full load, not router.push: the dashboard layout resolves the role
      // before it renders the admin role bar, so a client-side navigation would
      // paint the previous role's menu until something forced a refresh.
      router.replace('/admin');
      router.refresh();
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300"
      >
        <Icon name="shield" className="h-4 w-4" />
        <span className="hidden sm:inline">لوحة الإدارة</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="إغلاق"
            onClick={close}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-door-title"
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Icon name="shield" className="h-4 w-4" />
                </span>
                <h2 id="admin-door-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                  دخول الإدارة
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="إغلاق"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 px-5 py-5">
              <div>
                <label
                  htmlFor="admin-password"
                  className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  كلمة السر
                </label>
                <input
                  id="admin-password"
                  ref={inputRef}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-300 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !password}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="login" className="h-4 w-4" />
                {busy ? 'جارٍ التحقق...' : 'دخول'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}