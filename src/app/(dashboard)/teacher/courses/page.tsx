'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApiData, useSubmit } from '@/lib/hooks/use-api';
import { Card, Button, Badge, EmptyState } from '../../_components/ui';

interface CourseRow {
  id: string;
  title: string;
  type: 'FREE' | 'PAID';
  isPublished: boolean;
  subjectId: string;
  subject?: { id: string; name: string; nameAr: string | null };
  level?: { id: string; name: string };
  _count?: { videos: number; exercises: number; liveSessions: number; enrollments: number };
}

interface Option {
  id: string;
  name: string;
  nameAr?: string | null;
}

interface CreateBody {
  title: string;
  subjectId: string;
  levelId: string;
  description?: string;
  type: 'FREE' | 'PAID';
}

/**
 * Where a teacher decides whether what they add is free or paid.
 *
 * The choice is per course, and it is the only thing standing between a student
 * and the content: `FREE` opens to any signed-in student with no subscription and
 * no payment, `PAID` needs the subscription cell for the course's subject and
 * goes through payment plus admin approval. Free and paid are mixed freely
 * inside one subject, so this list has to say plainly which is which — a course
 * that silently became paid would lock out every student already using it.
 */
export default function TeacherCoursesPage() {
  const { data, error, loading, reload } = useApiData<{ courses: CourseRow[] }>('/api/courses');
  const subjects = useApiData<{ subjects: Option[] }>('/api/subjects');
  const levels = useApiData<{ levels: Option[] }>('/api/levels');

  const { submit, submitting, error: submitError, setError } = useSubmit<CreateBody, unknown>(
    '/api/courses',
    'POST',
  );

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [free, setFree] = useState(true);
  const [busyId, setBusyId] = useState('');

  const courses = data?.courses ?? [];
  const subjectList = subjects.data?.subjects ?? [];
  const levelList = levels.data?.levels ?? [];

  // Derived, not synced in an effect: while the teacher has not picked anything
  // the first subject/level is the selection, and an effect that writes state on
  // load would cascade a render for no reason.
  const effectiveSubjectId = subjectId || subjectList[0]?.id || '';
  const effectiveLevelId = levelId || levelList[0]?.id || '';

  const subjectName = (id: string) => {
    const s = subjectList.find((x) => x.id === id);
    return s?.nameAr ?? s?.name ?? id;
  };

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();

    if (!title.trim()) {
      setError('اكتب عنوان الدورة');
      return;
    }
    if (!effectiveSubjectId || !effectiveLevelId) {
      setError('اختر المادة والمستوى');
      return;
    }

    const result = await submit({
      title: title.trim(),
      subjectId: effectiveSubjectId,
      levelId: effectiveLevelId,
      description: description.trim() || undefined,
      type: free ? 'FREE' : 'PAID',
    });

    if (result !== null) {
      setTitle('');
      setDescription('');
      setShowForm(false);
      reload();
    }
  }

  /** Switch a course between free and paid. */
  async function toggleType(course: CourseRow) {
    setBusyId(course.id);
    const next = course.type === 'FREE' ? 'PAID' : 'FREE';

    await fetch(`/api/courses/${course.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: next }),
    });

    setBusyId('');
    reload();
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60" dir="rtl">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">دوراتي</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            >
              {showForm ? 'إخفاء النموذج' : 'دورة جديدة'}
            </button>
            <Link href="/teacher" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
              لوحة التحكم
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <p className="text-sm text-gray-600 dark:text-slate-400">
              حدّد لكل دورة إن كانت <strong className="text-gray-900 dark:text-slate-100">مجانية</strong> يدخلها أي طالب
              مباشرة، أم <strong className="text-gray-900 dark:text-slate-100">تتطلب اشتراكًا</strong> في المادة، وعندها
              يدفع الطالب ثم تراجع الإدارة الطلب قبل أن ينضم.
            </p>

        {showForm && (
          <Card className="p-5">
            <form onSubmit={handleCreate} className="space-y-4">
              <h2 className="font-semibold text-gray-900 dark:text-slate-100">إضافة دورة</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">عنوان الدورة</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: جبر السنة الثالثة متوسط"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">المادة</span>
                  <select
                    value={effectiveSubjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900"
                    required
                  >
                    {subjectList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameAr ?? s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">المستوى</span>
                  <select
                    value={effectiveLevelId}
                    onChange={(e) => setLevelId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900"
                    required
                  >
                    {levelList.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nameAr ?? l.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">الوصف</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm"
                  />
                </label>
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">طريقة الوصول</span>
                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFree(true)}
                    className={`p-3 rounded-xl border-2 text-right transition-colors${
                      free ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-slate-100 text-sm">مجاني</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">يدخله أي طالب مباشرة — بلا اشتراك ولا دفع</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFree(false)}
                    className={`p-3 rounded-xl border-2 text-right transition-colors${
                      !free ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-slate-100 text-sm">يتطلب اشتراكًا</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">يدفع الطالب ثم تراجع الإدارة الطلب قبل الدخول</p>
                  </button>
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3">
                  {submitError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium"
                >
                  {submitting ? 'جارٍ الحفظ...' : 'حفظ الدورة'}
                </button>
                <Button variant="secondary" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </Card>
        )}

        {error && (
          <p className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">{error}</p>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        )}

        {!loading && courses.length === 0 && (
          <EmptyState
            icon="📘"
            title="لا توجد دورات بعد"
            description="أنشئ أول دورة وحدّد إن كانت مجانية أم تتطلب اشتراكًا."
          />
        )}

        {!loading && courses.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <Card key={course.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-semibold text-gray-900 dark:text-slate-100">{course.title}</h2>
                  <Badge variant={course.type === 'FREE' ? 'green' : 'indigo'}>
                    {course.type === 'FREE' ? 'مجاني' : 'يتطلب اشتراكًا'}
                  </Badge>
                </div>

                <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">
                  {course.subject?.nameAr ?? course.subject?.name ?? subjectName(course.subjectId)}
                  {course.level ? ` · ${course.level.name}` : ''}
                </p>

                <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                  {course._count
                    ? `${course._count.videos} فيديو · ${course._count.exercises} تمرين · ${course._count.liveSessions} بث · ${course._count.enrollments} طالب`
                    : ''}
                  {course.isPublished ? '' : ' · غير منشورة'}
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === course.id}
                    onClick={() => void toggleType(course)}
                    className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60 disabled:opacity-50"
                  >
                    {busyId === course.id
                      ? '...'
                      : course.type === 'FREE'
                        ? 'اجعلها تتطلب اشتراكًا'
                        : 'اجعلها مجانية'}
                  </button>
                  <Link
                    href={`/teacher/videos?courseId=${course.id}`}
                    className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 dark:dark:hover:bg-slate-800 text-sm text-gray-700 dark:text-slate-300"
                  >
                    المحتوى
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}