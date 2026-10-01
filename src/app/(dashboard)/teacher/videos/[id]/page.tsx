'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface Video {
  id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnail: string | null;
  duration: number;
  order: number;
  isPublished: boolean;
  views: number;
  createdAt: string;
  course: {
    id: string;
    title: string;
  };
}

export default function EditVideoPage() {
  const params = useParams();
  const router = useRouter();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    url: '',
    thumbnail: '',
    duration: 0,
    order: 0,
    isPublished: true,
  });

  useEffect(() => {
    fetch(`/api/videos`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const found = data.data.videos.find((v: Video) => v.id === params.id);
          if (found) {
            setVideo(found);
            setFormData({
              title: found.title,
              description: found.description || '',
              url: found.url,
              thumbnail: found.thumbnail || '',
              duration: found.duration,
              order: found.order,
              isPublished: found.isPublished,
            });
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/videos/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.success) {
        router.push('/teacher/videos');
      } else {
        alert(data.message);
      }
    } catch {
      alert('حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900/60 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">الفيديو غير موجود</h2>
          <Link href="/teacher/videos" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">
            العودة لقائمة الفيديوهات
          </Link>
        </div>
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
            <Link href="/teacher/videos" className="flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 rounded-xl">
              <span>🎥</span>
              <span className="font-medium">الفيديوهات</span>
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
            <div className="flex items-center gap-4">
              <Link href="/teacher/videos" className="text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                → العودة
              </Link>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">تعديل الفيديو</h1>
            </div>
          </div>
        </header>

        <div className="p-8">
          <div className="max-w-2xl">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm mb-6">
              <div className="aspect-video bg-gray-100 dark:bg-slate-800 rounded-xl mb-4 relative">
                {video.thumbnail ? (
                  <Image
                    src={video.thumbnail}
                    alt={video.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 672px"
                    className="object-cover rounded-xl"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl rounded-xl">
                    🎬
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
                <span>{video.views} مشاهدة</span>
                <span>أضيف في {new Date(video.createdAt).toLocaleDateString('ar-DZ')}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">عنوان الفيديو</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الوصف</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">رابط الفيديو</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">رابط الصورة المصغرة</label>
                <input
                  type="url"
                  value={formData.thumbnail}
                  onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">المدة (بالثواني)</label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الترتيب</label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublished"
                  checked={formData.isPublished}
                  onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                  className="rounded border-gray-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500"
                />
                <label htmlFor="isPublished" className="text-sm text-gray-700 dark:text-slate-300">
                  منشور (مرئي للطلاب)
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
                <Link
                  href="/teacher/videos"
                  className="px-6 py-3 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60 transition-colors"
                >
                  إلغاء
                </Link>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
