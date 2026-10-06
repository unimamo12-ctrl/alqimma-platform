import Link from 'next/link';

/**
 * Shown wherever a teacher picks a course and has none to pick.
 *
 * Content — videos, exercises, files, live sessions — is attached to a course,
 * so a teacher with no course cannot add anything. The old copy said "create a
 * course first from the control panel", which was a dead end: the control panel
 * had no course form at all, so a new teacher was told to go and do something
 * that could not be done anywhere in the UI. The button below is the first page
 * that can actually do it.
 */
export function NoCoursesNotice({ what = 'المحتوى' }: { what?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
      <p className="font-medium">لا توجد دورات بعد</p>
      <p className="mt-1 text-amber-800 dark:text-amber-200">
        {what} يُضاف داخل دورة، فأنشئ دورة أولًا — وحدّد فيها إن كانت{' '}
        منشورة.
      </p>
      <Link
        href="/teacher/courses"
        className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
        إنشاء دورة الآن
      </Link>
    </div>
  );
}