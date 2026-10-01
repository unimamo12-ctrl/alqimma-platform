'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/hooks/use-api';
import Link from 'next/link';
import { NoCoursesNotice } from '../_components/no-courses-notice';

interface Exercise {
  id: string;
  title: string;
  description: string | null;
  questions: unknown[];
  duration: number;
  createdAt: string;
  course?: {
    id: string;
    title: string;
  };
}

interface Course {
  id: string;
  title: string;
  subject: { name: string };
  level: { name: string };
}

export default function TeacherExercisesPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newExercise, setNewExercise] = useState({
    courseId: '',
    title: '',
    description: '',
    questions: [] as unknown[],
    duration: 0,
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          router.push('/login');
          return;
        }
        setUser(data.data.user);
        setLoading(false);
      })
      .catch(() => router.push('/login'));
  }, [router]);

  useEffect(() => {
    if (user?.teacher?.id) {
      fetch(`/api/exercises?teacherId=${user.teacher.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setExercises(data.data.exercises);
          }
        })
        .catch(() => {});

      fetch(`/api/courses?teacherId=${user.teacher.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setCourses(data.data.courses);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const handleAddExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);

    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExercise),
      });

      const data = await res.json();

      if (data.success) {
        setExercises([data.data.exercise, ...exercises]);
        setShowAddModal(false);
        setNewExercise({
          courseId: '',
          title: '',
          description: '',
          questions: [],
          duration: 0,
        });
      } else {
        alert(data.message);
      }
    } catch {
      alert('حدث خطأ في الاتصال');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التمرين؟')) return;

    try {
      const res = await fetch(`/api/exercises/${exerciseId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        setExercises(exercises.filter((e) => e.id !== exerciseId));
      } else {
        alert(data.message);
      }
    } catch {
      alert('حدث خطأ في الاتصال');
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours} ساعة ${mins} دقيقة` : `${hours} ساعة`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60 flex">
      <aside className="w-64 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 fixed h-full overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-slate-100">منصة القمم</span>
          </div>

          <nav className="space-y-1">
            <Link href="/teacher" className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors">
              <span>📊</span>
              <span className="font-medium">لوحة التحكم</span>
            </Link>
            <Link href="/teacher/videos" className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors">
              <span>🎥</span>
              <span className="font-medium">الفيديوهات</span>
            </Link>
            <Link href="/teacher/files" className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors">
              <span>📁</span>
              <span className="font-medium">الملفات</span>
            </Link>
            <Link href="/teacher/exercises" className="flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 rounded-xl">
              <span>✏️</span>
              <span className="font-medium">التمارين</span>
            </Link>
            <Link href="/teacher/live" className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors">
              <span>📡</span>
              <span className="font-medium">البث المباشر</span>
            </Link>
            <Link href="/teacher/students" className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors">
              <span>👥</span>
              <span className="font-medium">الطلاب</span>
            </Link>
            <Link href="/teacher/profile" className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors">
              <span>👤</span>
              <span className="font-medium">الملف الشخصي</span>
            </Link>
            <Link href="/teacher/settings" className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors">
              <span>⚙️</span>
              <span className="font-medium">الإعدادات</span>
            </Link>
          </nav>
        </div>
      </aside>

      <main className="flex-1 mr-64">
        <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-40">
          <div className="flex items-center justify-between h-16 px-8">
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">إدارة التمارين</h1>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              + إضافة تمرين
            </button>
          </div>
        </header>

        <div className="p-8">
          {exercises.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">✏️</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">لا توجد تمارين</h3>
              <p className="text-gray-600 dark:text-slate-400 mb-6">ابدأ بإضافة تمرين جديد لطلابك</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
              >
                إضافة تمرين جديد
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-green-100 dark:bg-emerald-500/15 rounded-xl flex items-center justify-center text-2xl">
                      ✏️
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteExercise(exercise.id)}
                        className="px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors text-sm"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-1">{exercise.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">{exercise.course?.title ?? '—'}</p>
                  {exercise.description && (
                    <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 line-clamp-2">{exercise.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-slate-400">
                    <span>{exercise.questions.length} سؤال</span>
                    <span>{formatDuration(exercise.duration)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">إضافة تمرين جديد</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-400"
                >
                  ✕
                </button>
              </div>
            </div>
            <form onSubmit={handleAddExercise} className="p-6 space-y-4">
              <div>
                {courses.length === 0 ? (
                  <NoCoursesNotice what="التمرين" />
                ) : (
                  <>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الدورة</label>
                <select
                  value={newExercise.courseId}
                  onChange={(e) => setNewExercise({ ...newExercise, courseId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">اختر الدورة</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">عنوان التمرين</label>
                <input
                  type="text"
                  value={newExercise.title}
                  onChange={(e) => setNewExercise({ ...newExercise, title: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الوصف</label>
                <textarea
                  value={newExercise.description}
                  onChange={(e) => setNewExercise({ ...newExercise, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">المدة (بالدقائق)</label>
                <input
                  type="number"
                  value={newExercise.duration}
                  onChange={(e) => setNewExercise({ ...newExercise, duration: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {adding ? 'جاري الإضافة...' : 'إضافة التمرين'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-6 py-3 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
