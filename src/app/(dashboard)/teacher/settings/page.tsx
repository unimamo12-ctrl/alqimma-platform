'use client';

import { useState } from 'react';
import { TeacherShell, useProfileLoader } from '../_components/shell';

export default function TeacherSettingsPage() {
  const { profile, loading } = useProfileLoader();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ ok: false, text: 'كلمتا المرور غير متطابقتين' });
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage({ ok: false, text: data.message || 'تعذر تغيير كلمة المرور' });
        return;
      }

      setMessage({ ok: true, text: 'تم تغيير كلمة المرور بنجاح' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setMessage({ ok: false, text: 'تعذر الاتصال بالخادم' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <TeacherShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell>
      <div className="max-w-2xl space-y-6">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">معلومات الحساب</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="البريد الإلكتروني" value={profile?.email ?? '-'} />
            <Row label="الدور" value={roleLabel(profile?.role)} />
            <Row label="الحالة" value="نشط" />
          </dl>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-4">تغيير كلمة المرور</h2>

          {message && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm border${
                message.ok
                  ? 'bg-green-50 dark:bg-emerald-500/10 border-green-200 dark:border-emerald-500/30 text-green-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                كلمة المرور الحالية
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">8 أحرف على الأقل</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
            </button>
          </form>
        </section>
      </div>
    </TeacherShell>
  );
}

function roleLabel(role?: string) {
  if (role === 'ADMIN') return 'مدير';
  if (role === 'TEACHER') return 'أستاذ';
  if (role === 'STUDENT') return 'طالب';
  return '-';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-gray-500 dark:text-slate-400">{label}</dt>
      <dd className="text-gray-900 dark:text-slate-100 font-medium">{value}</dd>
    </div>
  );
}
