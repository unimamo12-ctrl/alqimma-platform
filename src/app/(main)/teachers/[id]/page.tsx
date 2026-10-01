'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  bio: string | null;
  avatar: string | null;
  subjects: string[];
  levels: string[];
  isOnline: boolean;
  user: {
    id: string;
    email: string;
    status: string;
  };
  _count: {
    courses: number;
    liveSessions: number;
  };
}

export default function TeacherProfilePage() {
  const params = useParams();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('courses');

  useEffect(() => {
    fetch(`/api/teachers`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const found = data.data.teachers.find(
            (t: Teacher) => t.id === params.id
          );
          setTeacher(found || null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">الأستاذ غير موجود</h2>
          <Link href="/teachers" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">
            العودة لقائمة الأساتذة
          </Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'courses', label: 'الدروس المسجلة', icon: '🎥' },
    { id: 'files', label: 'الملفات', icon: '📁' },
    { id: 'live', label: 'البث المباشر', icon: '📡' },
    { id: 'exercises', label: 'التمارين', icon: '✏️' },
    { id: 'announcements', label: 'الإعلانات', icon: '📢' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60">
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-slate-100">منصة القمم</span>
            </div>
            <nav className="flex items-center gap-4">
              <Link href="/" className="text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors">
                الرئيسية
              </Link>
              <Link href="/teachers" className="text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors">
                الأساتذة
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm mb-8">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="relative w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center text-5xl flex-shrink-0 overflow-hidden">
              {teacher.avatar ? (
                <Image
                  src={teacher.avatar}
                  alt={`${teacher.firstName} ${teacher.lastName}`}
                  fill
                  unoptimized
                  sizes="96px"
                  className="rounded-full object-cover"
                />
              ) : (
                '👨‍🏫'
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                  أ. {teacher.firstName} {teacher.lastName}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium${
                    teacher.isOnline
                      ? 'bg-green-100 text-green-700 dark:text-emerald-300'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      teacher.isOnline ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  ></span>
                  {teacher.isOnline ? 'متصل الآن' : 'غير متصل'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {teacher.subjects.map((subject) => (
                  <span
                    key={subject}
                    className="px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium"
                  >
                    {subject}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {teacher.levels.map((level) => (
                  <span
                    key={level}
                    className="px-3 py-1 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                  >
                    {level}
                  </span>
                ))}
              </div>

              {teacher.bio && (
                <p className="text-gray-600 dark:text-slate-400 leading-relaxed">{teacher.bio}</p>
              )}

              <div className="flex items-center gap-6 mt-4 text-sm text-gray-500 dark:text-slate-400">
                <span>{teacher._count.courses} درس</span>
                <span>{teacher._count.liveSessions} بث مباشر</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 dark:border-slate-700">
            <nav className="flex overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'courses' && (
              <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                <div className="text-5xl mb-4">🎥</div>
                <p>لا توجد دروس مسجلة حاليًا</p>
              </div>
            )}
            {activeTab === 'files' && (
              <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                <div className="text-5xl mb-4">📁</div>
                <p>لا توجد ملفات حاليًا</p>
              </div>
            )}
            {activeTab === 'live' && (
              <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                <div className="text-5xl mb-4">📡</div>
                <p>لا يوجد بث مباشر قادم حاليًا</p>
              </div>
            )}
            {activeTab === 'exercises' && (
              <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                <div className="text-5xl mb-4">✏️</div>
                <p>لا توجد تمارين حاليًا</p>
              </div>
            )}
            {activeTab === 'announcements' && (
              <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                <div className="text-5xl mb-4">📢</div>
                <p>لا توجد إعلانات حاليًا</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
