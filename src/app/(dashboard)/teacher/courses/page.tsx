'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApiData, useSubmit } from '@/lib/hooks/use-api';
import { Card, Button, Badge, EmptyState } from '../../_components/ui';

interface CourseRow {
  id: string;
  title: string;
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
}

/**
 * Where a teacher creates a course.
 *
 * This page used to hold the free/paid decision, and it was the most consequential
 * control on the platform: `PAID` needed a matching subscription cell, so a course
 * silently flipped to paid locked out every student already using it. Neither the
 * column nor the toggle exists now — every published course is open to every
 * signed-in student. What is left here is publication, which is the teacher's own
 * decision and still matters.
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

  const courses = data?.courses ?? [];
  const subjectList = subjects.data?.subjects ?? [];
  const levelList = levels.data?.levels ?? [];

  // Derived, not synced in an effect: while the teacher has not picked anything
  // the first subject/level is the selection, and an effect that writes state on
  // load would cascade a render for no reason.
  const effectiveSubjectId = subjectId || subjectList[0]?.id || '';
  const effectiveLevelId = levelId || levelList[0]?.id || '';

  // A course needs both, so the form is unusable until the platform has a
  // catalog. `loading` is excluded: before the fetches settle both lists are
  // empty, and that must not read as "not configured yet".
  const catalogLoaded = !subjects.loading && !levels.loading;
  const catalogReady = subjectList.length > 0 && levelList.length > 0;

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
    });

    if (result !== null) {
      setTitle('');
      setDescription('');
      setShowForm(false);
      reload();
    }
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
              كل الدورات متاحة لكل طالب مسجّل. انشرها لتظهر في المواد، وتذكّر أنك وحدك من يقرّر النشر.
            </p>

        {showForm && catalogLoaded && (
          <Card className="p-5">
            {!catalogReady ? (
              /*
               * An empty catalog makes this form impossible to submit, and two
               * empty dropdowns read as "the site is broken" rather than "nobody
               * has set the platform up yet". Only an admin can add a subject or
               * a level, so the pointer has to name that.
               */
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">لا توجد مواد أو مستويات في المنصة بعد</p>
                <p className="mt-1 text-amber-800">
                  {!subjectList.length && !levelList.length
                    ? 'لا يمكن إنشاء دورة قبل ضبط المواد والمستويات. هذا من صلاحيات الإدارة فقط.'
                    : !subjectList.length
                      ? 'لا توجد مواد بعد، فلا يمكن إنشاء دورة. أضِف مادة من الإدارة أولًا.'
                      : 'لا توجد مستويات بعد، فلا يمكن إنشاء دورة. أضف مستوى من الإدارة أولًا.'}
                </p>
                <Link
                  href="/admin/content"
                  className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  إعداد المواد والمستويات
                </Link>
              </div>
            ) : (
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
            )}
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
            description="أنشئ أول دورة ثم انشرها ليظهر محتواها للطلاب."
          />
        )}

        {!loading && courses.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <Card key={course.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-semibold text-gray-900 dark:text-slate-100">{course.title}</h2>
                  <Badge variant={course.isPublished ? 'green' : 'gray'}>
                    {course.isPublished ? 'منشورة' : 'غير منشورة'}
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
                </p>

                <div className="flex gap-2">
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