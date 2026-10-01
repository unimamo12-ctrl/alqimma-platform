'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { Card } from '../../../_components/ui';

interface Course {
  id: string;
  title: string;
  isPublished: boolean;
  subject: { name: string; nameAr: string | null } | null;
  level: { name: string } | null;
  _count: { videos: number; liveSessions: number; exercises: number; enrollments: number };
}

interface TeacherDetail {
  user: {
    id: string;
    email: string;
    status: string;
    emailVerified: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  };
  firstName: string;
  lastName: string;
  bio: string | null;
  subjects: string[];
  levels: string[];
  isOnline: boolean;
  courses: Course[];
  liveSessions: {
    id: string;
    title: string;
    status: string;
    scheduledAt: string;
    course: { id: string; title: string } | null;
    _count: { participants: number; messages: number };
  }[];
  quizzes: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
    _count: { assignments: number; attempts: number; questions: number };
  }[];
  announcements: { id: string; title: string; content: string; createdAt: string }[];
}

interface Video {
  id: string;
  title: string;
  isPublished: boolean;
  duration: number;
  views: number;
  course: { title: string } | null;
}
interface Exercise {
  id: string;
  title: string;
  duration: number;
  course: { title: string } | null;
}
interface File {
  id: string;
  name: string;
  fileType: string;
  size: number;
  isPublished: boolean;
  course: { title: string } | null;
}
interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  level: string | null;
  class: string | null;
  user: { email: string; status: string };
}

export default function AdminTeacherDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, error, loading } = useApiData<{
    teacher: TeacherDetail;
    students: StudentRow[];
    videos: Video[];
    exercises: Exercise[];
    files: File[];
  }>(`/api/admin/teachers/${params.id}`);

  const [tab, setTab] = useState<'content' | 'students'>('content');
  const [showReset, setShowReset] = useState(false);
  const [resetValue, setResetValue] = useState('');
  const [resetDone, setResetDone] = useState('');
  const [problem, setProblem] = useState('');

  const teacher = data?.teacher;

  async function resetPassword() {
    setProblem('');
    setResetDone('');
    const res = await fetch(`/api/admin/reset-password?userId=${teacher!.user.id}`, {
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
  if (!teacher) return <ErrorBox text="الأستاذ غير موجود" />;

  const totalVideos = data!.videos.length;
  const totalLive = teacher.liveSessions.length;
  const totalStudents = data!.students.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/teachers" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
          ← عودة للأساتذة
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
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">ستُنهى كل الجلسات النشطة لهذا الأستاذ.</p>
          <input
            type="password"
            value={resetValue}
            onChange={(e) => setResetValue(e.target.value)}
            placeholder="6 أحرف على الأقل"
            className="mt-3 w-full rounded-xl border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {problem && <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">{problem}</div>}
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
              {teacher.firstName.charAt(0)}
            </span>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                أ. {teacher.firstName} {teacher.lastName}
              </h1>
              <p className="text-sm text-gray-500 dark:text-slate-400" dir="ltr">{teacher.user.email}</p>
            </div>
          </div>
          <Tag className={teacher.isOnline ? 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}>
            {teacher.isOnline ? 'متصل' : 'غير متصل'}
          </Tag>
        </div>

        {teacher.bio && (
          <p className="mt-4 rounded-xl bg-gray-50 dark:bg-slate-900/60 px-4 py-3 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
            {teacher.bio}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {teacher.subjects.map((s) => (
            <span key={s} className="rounded-lg bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              {s}
            </span>
          ))}
          {teacher.levels.slice(0, 4).map((l) => (
            <span key={l} className="rounded-lg bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-400">
              {l}
            </span>
          ))}
        </div>

        <dl className="mt-5 grid gap-3 border-t border-gray-100 dark:border-slate-800 pt-5 sm:grid-cols-3">
          <Stat label="تاريخ الانضمام" value={fmt(teacher.user.createdAt)} />
          <Stat label="آخر دخول" value={teacher.user.lastLoginAt ? fmt(teacher.user.lastLoginAt) : '—'} />
          <Stat label="حالة الحساب" value={teacher.user.status} />
        </dl>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Tile label="دورات" value={teacher.courses.length} tone="indigo" />
        <Tile label="فيديوهات" value={totalVideos} tone="purple" />
        <Tile label="بثوث" value={totalLive} tone="red" />
        <Tile label="اختبارات" value={teacher.quizzes.length} tone="amber" />
        <Tile label="طلاب" value={totalStudents} tone="green" />
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700">
        {(
          [
            { key: 'content' as const, label: 'كل المحتوى' },
            { key: 'students' as const, label: `الطلاب (${totalStudents})` },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors${
              tab === t.key
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'content' ? (
        <div className="space-y-5">
          <Panel title="الدورات" empty="لا توجد دورات">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                  <tr>
                    <Th>الدورة</Th><Th>المادة</Th><Th>المحتوى</Th><Th>الطلاب</Th><Th>الحالة</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {teacher.courses.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 text-gray-900 dark:text-slate-100">{c.title}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{c.subject?.nameAr ?? c.subject?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-slate-400">
                        {c._count.videos} فيديو · {c._count.liveSessions} بث · {c._count.exercises} تمرين
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{c._count.enrollments}</td>
                      <td className="px-4 py-3">
                        <Tag className={c.isPublished ? 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}>
                          {c.isPublished ? 'منشورة' : 'مخفية'}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="الفيديوهات المرفوعة" empty="لا توجد فيديوهات">
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {data!.videos.map((v) => (
                <li key={v.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-gray-900 dark:text-slate-100">{v.title}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{v.course?.title ?? '—'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                    <span>{Math.round(v.duration / 60)} د</span>
                    <span>{v.views} مشاهدة</span>
                    <Tag className={v.isPublished ? 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}>
                      {v.isPublished ? 'منشور' : 'مسودة'}
                    </Tag>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="البثوث" empty="لا توجد بثوث">
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {teacher.liveSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-gray-900 dark:text-slate-100">{s.title}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{s.course?.title ?? '—'} · {fmt(s.scheduledAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="text-gray-500 dark:text-slate-400">{s._count.participants} مشارك</span>
                    <Tag>{s.status}</Tag>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="الاختبارات" empty="لا توجد اختبارات">
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {teacher.quizzes.map((q) => (
                <li key={q.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-gray-900 dark:text-slate-100">{q.title}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {q._count.questions} سؤال · {q._count.attempts} محاولة
                    </p>
                  </div>
                  <Tag>{q.status}</Tag>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="التمارين" empty="لا توجد تمارين">
              <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                {data!.exercises.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="truncate text-gray-900 dark:text-slate-100">{e.title}</span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-slate-400">{e.course?.title}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="الملفات" empty="لا توجد ملفات">
              <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                {data!.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="truncate text-gray-900 dark:text-slate-100">{f.name}</span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-slate-400">
                      {f.fileType} · {Math.round(f.size / 1024)} ك.ب
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {teacher.announcements.length > 0 && (
            <Panel title="الإعلانات" empty="">
              <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                {teacher.announcements.map((a) => (
                  <li key={a.id} className="px-4 py-3 text-sm">
                    <p className="font-medium text-gray-900 dark:text-slate-100">{a.title}</p>
                    <p className="mt-1 text-gray-600 dark:text-slate-400">{a.content}</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-slate-500" dir="ltr">{fmt(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      ) : (
        <Panel title="الطلاب المسجّلون في دوراته" empty="لا يوجد طلاب">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                <tr>
                  <Th>الطالب</Th><Th>البريد</Th><Th>المستوى</Th><Th>القسم</Th><Th>الحالة</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {data!.students.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/students/${s.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
                        {s.firstName} {s.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400" dir="ltr">{s.user.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{s.level ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{s.class ?? '—'}</td>
                    <td className="px-4 py-3"><Tag>{s.user.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
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
      <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-slate-100">{value}</dd>
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
  tone: 'indigo' | 'purple' | 'red' | 'amber' | 'green';
}) {
  const tones = {
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    purple: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600',
    red: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600',
    green: 'bg-green-50 dark:bg-emerald-500/10 text-green-600 dark:text-emerald-400',
  };
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className={`inline-block rounded-lg px-2 py-1 text-xs font-semibold${tones[tone]}`}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function Panel({
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