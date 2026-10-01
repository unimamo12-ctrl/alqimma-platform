'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApiData } from '@/lib/hooks/use-api';
import { Icon, type IconName } from '@/components/icons';

interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  type: string;
  price: number | string;
  teacherId: string;
  subject?: { id: string; name: string; nameAr: string | null } | null;
  level?: { id: string; name: string } | null;
  _count?: { videos?: number; liveSessions?: number; exercises?: number; enrollments?: number };
}

interface LiveRow {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  course?: { id: string; title: string } | null;
  teacher?: { id: string; firstName: string; lastName: string } | null;
  _count?: { participants?: number; messages?: number };
}

interface SubjectOption {
  id: string;
  name: string;
  nameAr: string | null;
}

interface LevelOption {
  id: string;
  name: string;
  nameAr: string | null;
}

const STATUS_STYLES: Record<string, { variant: 'green' | 'red' | 'indigo' | 'gray'; label: string }> = {
  LIVE: { variant: 'red', label: 'مباشر الآن' },
  SCHEDULED: { variant: 'indigo', label: 'مجدولة' },
  ENDED: { variant: 'gray', label: 'منتهية' },
  CANCELLED: { variant: 'gray', label: 'ملغاة' },
};

export default function AdminContentPage() {
  const router = useRouter();

  const coursesRes = useApiData<{ courses: CourseRow[] }>('/api/courses');
  const liveRes = useApiData<{ sessions: LiveRow[] }>('/api/live?all=true');
  const teachersRes = useApiData<{ teachers: { id: string; firstName: string; lastName: string }[] }>('/api/teachers');
  const subjectsRes = useApiData<{ subjects: SubjectOption[] }>('/api/subjects');
  const levelsRes = useApiData<{ levels: LevelOption[] }>('/api/levels');

  const [tab, setTab] = useState<'courses' | 'live'>('courses');
  const [editingCourse, setEditingCourse] = useState<CourseRow | null>(null);
  const [flash, setFlash] = useState('');
  const [problem, setProblem] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    teacherId: '',
    subjectId: '',
    levelId: '',
    isPublished: true,
  });

  const [saving, setSaving] = useState(false);

  const courses = useMemo(() => coursesRes.data?.courses ?? [], [coursesRes.data]);
  const sessions = useMemo(() => liveRes.data?.sessions ?? [], [liveRes.data]);

  async function patch(url: string, method: 'PUT' | 'PATCH' | 'DELETE', body?: unknown) {
    setFlash('');
    setProblem('');
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok || !json.success) {
      setProblem(json.message || 'تعذر تنفيذ العملية');
      return false;
    }
    setFlash('تم');
    coursesRes.reload();
    liveRes.reload();
    router.refresh();
    return true;
  }

  function openEditor(course: CourseRow) {
    setEditingCourse(course);
    setProblem('');
    setFlash('');
    setForm({
      title: course.title,
      description: course.description ?? '',
      teacherId: course.teacherId,
      subjectId: course.subject?.id ?? '',
      levelId: course.level?.id ?? '',
      isPublished: course.isPublished,
    });
  }

  async function save() {
    if (!editingCourse) return;
    setSaving(true);
    const ok = await patch(`/api/courses/${editingCourse.id}`, 'PUT', {
      title: form.title,
      description: form.description || null,
      teacherId: form.teacherId || undefined,
      subjectId: form.subjectId || undefined,
      levelId: form.levelId || undefined,
      isPublished: form.isPublished,
    });
    setSaving(false);
    if (ok) setEditingCourse(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">إدارة المحتوى</h1>
        <p className="mt-1 text-gray-500 dark:text-slate-400">
          التعديل والحذف والنشر للدورات والبثوث. الحذف مرفوض عند وجود سجلات.
        </p>
      </div>

      {flash && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {flash}
        </div>
      )}
      {problem && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {problem}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700">
        {(
          [
            { key: 'courses' as const, label: `الدورات (${courses.length})` },
            { key: 'live' as const, label: `البثوث (${sessions.length})` },
          ]
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors${
              tab === item.key
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'courses' ? (
        coursesRes.loading ? (
          <Loading />
        ) : courses.length === 0 ? (
          <Empty icon="book" text="لا توجد دورات" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                <tr>
                  <Th>الدورة</Th>
                  <Th>الأستاذ</Th>
                  <Th>المادة</Th>
                  <Th>المحتوى</Th>
                  <Th>الحالة</Th>
                  <Th>إجراءات</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {courses.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-gray-900 dark:text-slate-100">{course.title}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                      {teachersRes.data?.teachers.find((t) => t.id === course.teacherId)
                        ? `${teachersRes.data.teachers.find((t) => t.id === course.teacherId)?.firstName} ${teachersRes.data.teachers.find((t) => t.id === course.teacherId)?.lastName}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                      {course.subject?.nameAr ?? course.subject?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400 text-xs">
                      {course._count?.videos ?? 0} فيديو · {course._count?.liveSessions ?? 0} بث ·{' '}
                      {course._count?.enrollments ?? 0} طالب
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          void patch(`/api/courses/${course.id}`, 'PUT', {
                            isPublished: !course.isPublished,
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-medium${
                          course.isPublished
                            ? 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
                        }`}
                      >
                        {course.isPublished ? 'منشورة' : 'مخفية'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditor(course)}
                          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => void patch(`/api/courses/${course.id}`, 'DELETE')}
                          className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : liveRes.loading ? (
        <Loading />
      ) : sessions.length === 0 ? (
        <Empty icon="broadcast" text="لا توجد بثوث" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
              <tr>
                <Th>البث</Th>
                <Th>الدورة</Th>
                <Th>الأستاذ</Th>
                <Th>الموعد</Th>
                <Th>الحالة</Th>
                <Th>إجراءات</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {sessions.map((session) => {
                const meta = STATUS_STYLES[session.status] ?? STATUS_STYLES.ENDED;
                return (
                  <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-gray-900 dark:text-slate-100">{session.title}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{session.course?.title ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                      {session.teacher
                        ? `${session.teacher.firstName} ${session.teacher.lastName}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400" dir="ltr">
                      {new Date(session.scheduledAt).toLocaleString('ar-DZ')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-400">
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/teacher/live/${session.id}`}
                          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                        >
                          فتح
                        </Link>
                        <button
                          type="button"
                          onClick={() => void patch(`/api/live/${session.id}`, 'DELETE')}
                          className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">تعديل الدورة</h2>

            <Field label="العنوان" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <Field
              label="الوصف"
              value={form.description}
              onChange={(v) => setForm({ ...form, description: v })}
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">الأستاذ</label>
              <select
                value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                className="w-full rounded-xl border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {(teachersRes.data?.teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">المادة</label>
                <select
                  value={form.subjectId}
                  onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">—</option>
                  {(subjectsRes.data?.subjects ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr ?? s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">المستوى</label>
                <select
                  value={form.levelId}
                  onChange={(e) => setForm({ ...form, levelId: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">—</option>
                  {(levelsRes.data?.levels ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nameAr ?? l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                className="rounded border-gray-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500"
              />
              الدورة منشورة
            </label>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className="flex-1 rounded-xl border border-gray-300 dark:border-slate-600 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !form.title}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-slate-400">{children}</th>;
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
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-600" />
    </div>
  );
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-20 text-center">
      <Icon name={icon} className="mx-auto h-8 w-8 text-gray-300 dark:text-slate-600" />
      <p className="mt-3 text-gray-500 dark:text-slate-400">{text}</p>
    </div>
  );
}