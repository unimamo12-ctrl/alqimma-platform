'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { Card } from '../../../_components/ui';

interface Detail {
  user: {
    id: string;
    email: string;
    status: string;
    emailVerified: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    _count: { refreshTokens: number };
  };
  firstName: string;
  lastName: string;
  phone: string | null;
  level: string | null;
  class: string | null;
  enrollments: {
    id: string;
    course: { id: string; title: string; isPublished: boolean; subject: { nameAr: string | null; name: string }; level: { name: string } };
  }[];
  quizAttempts: {
    id: string;
    attemptNumber: number;
    status: string;
    percentage: number;
    scorePoints: number;
    maxPoints: number;
    startedAt: string;
    quiz: { id: string; title: string };
  }[];
  attendances: {
    id: string;
    joinTime: string;
    duration: number;
    session: { id: string; title: string; status: string; scheduledAt: string; course: { title: string } | null };
  }[];
  progress: {
    videoId: string;
    progress: number;
    completed: boolean;
    lastPosition: number;
    video: { id: string; title: string; duration: number; course: { title: string } | null };
  }[];
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300',
  EXPIRED: 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400',
};

export default function AdminStudentDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, error, loading } = useApiData<{ student: Detail }>(
    `/api/admin/students/${params.id}`,
  );

  const [showReset, setShowReset] = useState(false);
  const [resetValue, setResetValue] = useState('');
  const [resetDone, setResetDone] = useState('');
  const [problem, setProblem] = useState('');

  const student = data?.student;

  async function resetPassword() {
    setProblem('');
    setResetDone('');
    const res = await fetch(`/api/admin/reset-password?userId=${student!.user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: resetValue, confirmPassword: resetValue }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setProblem(json.message || 'تعذر تغيير كلمة السر');
      return;
    }
    setResetDone(json.message || 'تم');
    setResetValue('');
    setShowReset(false);
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox text={error} />;
  if (!student) return <ErrorBox text="الطالب غير موجود" />;

  const graded = student.quizAttempts.filter((a) => a.status === 'GRADED');
  const avgPercent = graded.length
    ? Math.round(graded.reduce((sum, a) => sum + a.percentage, 0) / graded.length)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/students" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
          ← عودة للطلاب
        </Link>
        <button
          type="button"
          onClick={() => setShowReset((v) => !v)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:bg-slate-800/60"
        >
          تغيير كلمة السر
        </button>
      </div>

      {resetDone && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {resetDone}
        </div>
      )}

      {showReset && (
        <Card className="max-w-md p-5">
          <h2 className="font-semibold text-gray-900 dark:text-slate-100">كلمة سر جديدة</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            ستُنهى كل الجلسات النشطة لهذا المستخدم.
          </p>
          <input
            type="password"
            value={resetValue}
            onChange={(e) => setResetValue(e.target.value)}
            placeholder="6 أحرف على الأقل"
            className="mt-3 w-full rounded-xl border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {problem && (
            <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">{problem}</div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={resetPassword}
              disabled={resetValue.length < 6}
              className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              تعيين
            </button>
            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="flex-1 rounded-xl border border-gray-300 dark:border-slate-600 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
            >
              إلغاء
            </button>
          </div>
        </Card>
      )}

      {/* Identity */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-bold text-white">
              {student.firstName.charAt(0)}
            </span>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                {student.firstName} {student.lastName}
              </h1>
              <p className="text-sm text-gray-500 dark:text-slate-400" dir="ltr">{student.user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Tag className={student.user.status === 'ACTIVE' ? STATUS_STYLES.ACTIVE : STATUS_STYLES.EXPIRED}>
              {student.user.status}
            </Tag>
            {student.level && <Tag>{student.level}</Tag>}
            {student.class && <Tag>القسم {student.class}</Tag>}
          </div>
        </div>

        <dl className="mt-5 grid gap-3 border-t border-gray-100 dark:border-slate-800 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="الهاتف" value={student.phone ?? '—'} />
          <Stat label="آخر دخول" value={student.user.lastLoginAt ? fmt(student.user.lastLoginAt) : 'لم يسجّل الدخول'} />
          <Stat label="تاريخ الإنشاء" value={fmt(student.user.createdAt)} />
          <Stat label="جلسات نشطة" value={String(student.user._count.refreshTokens)} />
        </dl>
      </Card>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="دورات مسجّل بها" value={student.enrollments.length} tone="purple" />
        <Tile label="محاولات اختبار" value={student.quizAttempts.length} tone="amber" />
        <Tile label="نسبة الاختبارات" value={avgPercent === null ? '—' : `${avgPercent}%`} tone="green" />
      </div>

      {/* Enrollments */}
      <Section title="الدورات المسجّل بها" empty="لا يوجد تسجيل في دورة">
        <ul className="divide-y divide-gray-100 dark:divide-slate-800">
          {student.enrollments.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-gray-900 dark:text-slate-100">{e.course.title}</span>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {e.course.subject.nameAr ?? e.course.subject.name} · {e.course.level.name}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Quiz attempts */}
      <Section title="محاولات الاختبارات" empty="لا توجد محاولات">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
              <tr>
                <Th>الاختبار</Th>
                <Th>المحاولة</Th>
                <Th>النتيجة</Th>
                <Th>الحالة</Th>
                <Th>التاريخ</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {student.quizAttempts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-gray-900 dark:text-slate-100">{a.quiz.title}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">#{a.attemptNumber}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">
                    {a.scorePoints}/{a.maxPoints} ({Math.round(a.percentage)}%)
                  </td>
                  <td className="px-4 py-3"><Tag>{a.status}</Tag></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400" dir="ltr">{fmt(a.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Attendance */}
      <Section title="سجل الحضور" empty="لا يوجد حضور">
        <ul className="divide-y divide-gray-100 dark:divide-slate-800">
          {student.attendances.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-gray-900 dark:text-slate-100">{a.session.title}</span>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {fmt(a.session.scheduledAt)} · {Math.round(a.duration / 60)} دقيقة
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Video progress */}
      <Section title="تقدم الفيديوهات" empty="لا يوجد تقدم">
        <ul className="divide-y divide-gray-100 dark:divide-slate-800">
          {student.progress.map((p) => (
            <li key={p.videoId} className="px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-900 dark:text-slate-100">{p.video.title}</span>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {p.completed ? 'مكتمل' : `${Math.round(p.progress)}%`}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${p.completed ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${p.completed ? 100 : p.progress}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function fmt(value: string) {
  return new Date(value).toLocaleDateString('ar-DZ');
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-slate-400">{children}</th>;
}

function Tag({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium${className || 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'}`}>
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-slate-900/60 px-4 py-3">
      <dt className="text-xs text-gray-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-gray-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: 'indigo' | 'purple' | 'amber' | 'green';
}) {
  const tones = {
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    purple: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600',
    green: 'bg-green-50 dark:bg-emerald-500/10 text-green-600 dark:text-emerald-400',
  };
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className={`inline-block rounded-lg px-2 py-1 text-xs font-semibold${tones[tone]}`}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <Card>
      <div className="border-b border-gray-100 dark:border-slate-800 px-5 py-3">
        <h2 className="font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
      </div>
      {isEmpty ? <p className="px-5 py-6 text-center text-sm text-gray-400 dark:text-slate-500">{empty}</p> : children}
    </Card>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-600" />
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-5 py-4 text-sm text-rose-700 dark:text-rose-300">
      {text}
    </div>
  );
}