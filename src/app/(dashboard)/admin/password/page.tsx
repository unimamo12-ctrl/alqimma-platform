'use client';

import { useState } from 'react';
import { AdminShell, useAdminGuard, Loading } from '../_components/shell';
import { useCurrentUser } from '@/lib/hooks/use-api';
import { Card } from '../../_components/ui';

export default function AdminPasswordPage() {
  const ready = useAdminGuard();
  const me = useCurrentUser();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setDone('');

    if (next !== confirm) {
      setError('كلمتا السر غير متطابقتين');
      return;
    }
    if (next.length < 6) {
      setError('كلمة السر الجديدة قصيرة (6 أحرف على الأقل)');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'تعذر تغيير كلمة السر');
        return;
      }
      setDone('تم تغيير كلمة السر بنجاح');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <AdminShell><Loading /></AdminShell>;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">كلمة السر</h1>
          <p className="mt-1 text-gray-500 dark:text-slate-400">
            تغيير كلمة سر حسابك الحالي: {me.data?.user?.email}
          </p>
        </div>

        <Card className="max-w-md p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field
              label="كلمة السر الحالية"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
            <Field
              label="كلمة السر الجديدة"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
            />
            <Field
              label="تأكيد كلمة السر الجديدة"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />

            {error && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}
            {done && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                {done}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !current || !next}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'جاري الحفظ...' : 'تغيير كلمة السر'}
            </button>
          </form>
        </Card>

        <Card className="max-w-md border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-5">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200">تغيير كلمة سر مستخدم آخر</h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-800 dark:text-amber-200">
            لتغيير كلمة سر طالب أو أستاذ: افتح صفحته من «الطلاب» أو «الأساتذة» ثم استخدم زر
            «تغيير كلمة السر» الموجود في أعلى الصفحة.
          </p>
        </Card>
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">{label}</label>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
      />
    </div>
  );
}