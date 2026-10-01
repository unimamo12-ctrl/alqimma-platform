'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApiData, useSubmit } from '@/lib/hooks/use-api';
import { NoCoursesNotice } from '../_components/no-courses-notice';

interface LiveSessionRow {
  id: string;
  title: string;
  scheduledAt: string;
  status: string;
  isRecorded: boolean;
  course?: { id: string; title: string };
}

interface CourseRow {
  id: string;
  title: string;
}

interface AudienceData {
  courseId: string;
  eligibleCount: number;
  eligible: { id: string; name: string; email: string }[];
  enrolledCount: number;
  totalStudents: number;
  livePriceActive: boolean;
}

interface CreateLiveBody {
  courseId: string;
  title: string;
  description?: string;
  scheduledAt?: string;
  startNow: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'مجدولة',
  LIVE: 'مباشر',
  ENDED: 'منتهية',
  CANCELLED: 'ملغاة',
};

export default function TeacherLiveListPage() {
  const router = useRouter();
  // only SCHEDULED/LIVE: finished and cancelled sessions must not linger here
  const { data, error, loading, reload } = useApiData<{ sessions: LiveSessionRow[] }>('/api/live');
  const courses = useApiData<{ courses: CourseRow[] }>('/api/courses');
  const { submit, submitting, error: submitError, setError } = useSubmit<CreateLiveBody, { session: LiveSessionRow }>('/api/live');

  const [showForm, setShowForm] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startNow, setStartNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');

  const sessions = data?.sessions ?? [];
  const courseList = courses.data?.courses ?? [];
  const canStartNow = startNow || Boolean(scheduledAt);

  // Who can actually join a broadcast for the chosen course. Fetched per course
  // so the teacher sees an empty audience *before* going live, instead of
  // discovering it from an empty roster.
  const audience = useApiData<AudienceData>(
    courseId ? `/api/live/audience?courseId=${encodeURIComponent(courseId)}` : null,
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!courseId || !title.trim()) {
      setError('اختر الدورة واكتب عنوان البث');
      return;
    }

    const result = await submit({
      courseId,
      title: title.trim(),
      description: description.trim() || undefined,
      scheduledAt: startNow ? undefined : new Date(scheduledAt).toISOString(),
      startNow,
    });

    if (result?.session) {
      setCourseId('');
      setTitle('');
      setDescription('');
      setScheduledAt('');
      setShowForm(false);

      if (startNow) {
        router.push(`/teacher/live/${result.session.id}`);
        return;
      }

      reload();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60" dir="rtl">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">البث المباشر</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            >
              {showForm ? 'إخفاء النموذج' : 'بث جديد'}
            </button>
            <Link
              href="/teacher"
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
            >
              العودة للوحة التحكم
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-slate-100">إنشاء بث مباشر</h2>

            {courseList.length === 0 ? (
              <NoCoursesNotice what="البث المباشر" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">الدورة</span>
                  <select
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900"
                    required
                  >
                    <option value="">— اختر الدورة —</option>
                    {courseList.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">عنوان البث</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: مراجعة وسط الفصل"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm"
                    required
                  />
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

                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={startNow}
                    onChange={(e) => setStartNow(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700 dark:text-slate-300">ابدأ البث فورًا</span>
                </label>

                {!startNow && (
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-300">موعد البث</span>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm"
                      required
                    />
                  </label>
                )}
              </div>
            )}

            {courseId && audience.data && (
              <div
                className={`rounded-lg border p-3 text-sm${
                  audience.data.eligibleCount > 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200'
                }`}
              >
                {audience.data.eligibleCount > 0 ? (
                  <>
                    <p className="font-medium">
                      سيتمكن {audience.data.eligibleCount} طالب من مشاهدة هذا البث
                    </p>
                    <p className="text-xs mt-1 opacity-90">
                      {[...new Set(audience.data.eligible.map((s) => s.name))].join('، ')}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">
                      لا يوجد طالب مشترك في «البث المباشر» لهذه المادة — لن يراه أحد
                    </p>
                    <p className="text-xs mt-1 opacity-90">
                      اشتراك «البث المباشر» يُشترى منفصلًا عن الفيديو والتمارين، ولا
                      يكفي التسجيل في الدورة.
                      {audience.data.totalStudents > 0 && (
                        <>
                          {' '}
                          (إجمالي الطلاب المنخرطين: {audience.data.totalStudents})
                        </>
                      )}
                    </p>
                  </>
                )}
                {!audience.data.livePriceActive && (
                  <p className="text-xs mt-2 font-medium">
                    تنبيه: سعر «البث المباشر» لهذه المادة معطّل، فاشتراك جديد
                    غير ممكن حتى تعيد تفعيله من لوحة الإدارة.
                  </p>
                )}
              </div>
            )}

            {audience.error && (
              <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3">
                تعذر حساب عدد المشاهدين: {audience.error}
              </p>
            )}

            {submitError && (
              <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3">
                {submitError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !canStartNow}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium"
              >
                {submitting ? 'جارٍ الإنشاء...' : 'إنشاء البث'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 dark:dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 text-sm font-medium"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700">
            <p className="text-gray-500 dark:text-slate-400">لا توجد حصص مباشرة نشطة</p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">
              الحصص المنتهية لا تظهر هنا، ووجد تسجيلها في صفحة الفيديوهات.
            </p>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="font-semibold text-gray-900 dark:text-slate-100">{item.title}</h2>
                  <StatusBadge status={item.status} />
                </div>

                <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">{item.course?.title ?? '—'}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-4" dir="ltr">
                  {new Date(item.scheduledAt).toLocaleString('ar-DZ')}
                </p>

                <Link
                  href={`/teacher/live/${item.id}`}
                  className="inline-block w-full text-center py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                >
                  {item.status === 'LIVE' ? 'انضم للبث' : 'فتح غرفة الحصة'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  // the list only ever renders SCHEDULED or LIVE
  const map: Record<string, { label: string; className: string }> = {
    SCHEDULED: { label: 'مجدولة', className: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' },
    LIVE: { label: 'مباشر', className: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300' },
  };

  const item = map[status] ?? map.SCHEDULED;

  return (
    <span className={`text-xs px-2 py-1 rounded-full${item.className}`}>
      {STATUS_LABELS[status] ?? item.label}
    </span>
  );
}
