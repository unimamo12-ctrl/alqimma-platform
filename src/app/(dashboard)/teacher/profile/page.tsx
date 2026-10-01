'use client';

import { useState } from 'react';
import { TeacherShell, useProfileLoader } from '../_components/shell';
import type { Profile } from '../_components/shell';

export default function TeacherProfilePage() {
  const { profile, loading } = useProfileLoader();

  if (loading || !profile) {
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
      <div className="max-w-2xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-6">الملف الشخصي</h2>
        <ProfileForm key={profile.email} profile={profile} />
      </div>
    </TeacherShell>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, bio, phone }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage({ ok: false, text: data.message || 'تعذر الحفظ' });
        return;
      }

      setMessage({ ok: true, text: 'تم حفظ التغييرات بنجاح' });
    } catch {
      setMessage({ ok: false, text: 'تعذر الاتصال بالخادم' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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

        <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم" value={firstName} onChange={setFirstName} />
            <Field label="النسب" value={lastName} onChange={setLastName} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
              البريد الإلكتروني
            </label>
            <input
              value={profile.email}
              disabled
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 rounded-lg text-gray-500 dark:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">رقم الهاتف</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">نبذة</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">المواد</label>
            <div className="flex flex-wrap gap-2">
              {(profile.subjects ?? []).length === 0 ? (
                <span className="text-sm text-gray-400 dark:text-slate-500">لا توجد مواد</span>
              ) : (
                profile.subjects?.map((subject) => (
                  <span
                    key={subject}
                    className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-sm"
                  >
                    {subject}
                  </span>
                ))
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
        </form>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
      />
    </div>
  );
}
