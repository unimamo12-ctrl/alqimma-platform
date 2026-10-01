'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/hooks/use-api';
import Link from 'next/link';
import { NoCoursesNotice } from '../_components/no-courses-notice';
import Image from 'next/image';
import { formatBytes, readVideoDuration, uploadFile } from '@/lib/upload-client';


interface Video {
  id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnail: string | null;
  duration: number;
  views: number;
  isPublished: boolean;
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

export default function TeacherVideosPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVideo, setNewVideo] = useState({
    courseId: '',
    title: '',
    description: '',
    url: '',
    thumbnail: '',
    duration: 0,
  });
  const [adding, setAdding] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setNewVideo({ courseId: '', title: '', description: '', url: '', thumbnail: '', duration: 0 });
    setSelectedFile(null);
    setUploadPercent(0);
    setUploadError('');
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
      fetch(`/api/videos?teacherId=${user.teacher.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setVideos(data.data.videos);
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

  const handlePickFile = (file: File | null) => {
    setUploadError('');

    if (!file) {
      setSelectedFile(null);
      setPreviewUrl('');
      setNewVideo((prev) => ({ ...prev, url: '' }));
      return;
    }

    if (!file.type.startsWith('video/')) {
      setUploadError('اختر ملف فيديو صالحًا (MP4 أو WebM أو MOV)');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setNewVideo((prev) => ({ ...prev, url: '', title: prev.title || file.name.replace(/\.[^.]+$/, '') }));

    void readVideoDuration(URL.createObjectURL(file)).then((duration) => {
      setNewVideo((prev) => (prev.duration === 0 ? { ...prev, duration } : prev));
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('اختر ملف فيديو من الهاتف أو الحاسوب أولًا');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const upload = await uploadFile(selectedFile, 'video', setUploadPercent);
      setNewVideo((prev) => ({ ...prev, url: upload.url }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'فشل رفع الملف');
    } finally {
      setUploading(false);
    }
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);

    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newVideo),
      });

      const data = await res.json();

      if (data.success) {
        setVideos([data.data.video, ...videos]);
        setShowAddModal(false);
        resetForm();
      } else {
        alert(data.message);
      }
    } catch {
      alert('حدث خطأ في الاتصال');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الفيديو؟')) return;

    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        setVideos(videos.filter((v) => v.id !== videoId));
      } else {
        alert(data.message);
      }
    } catch {
      alert('حدث خطأ في الاتصال');
    }
  };

  const handleTogglePublish = async (video: Video) => {
    const next = !video.isPublished;
    const warn = next
      ? 'سيظهر هذا الفيديو لجميع طلاب الدورة فورًا. هل تريد نشره؟'
      : 'سيختفي هذا الفيديو من عند الطلاب. هل تريد إخفاؤه؟';
    if (!confirm(warn)) return;

    setPublishBusyId(video.id);
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message ?? 'تعذّر تغيير حالة النشر');
        return;
      }
      setVideos(videos.map((v) => (v.id === video.id ? { ...v, isPublished: next } : v)));
    } catch {
      alert('حدث خطأ في الاتصال');
    } finally {
      setPublishBusyId(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">إدارة الفيديوهات</h1>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              + إضافة فيديو
            </button>
          </div>
        </header>

        <div className="p-8">
          {videos.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🎥</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">لا توجد فيديوهات</h3>
              <p className="text-gray-600 dark:text-slate-400 mb-6">ابدأ بإضافة فيديو جديد لطلابك</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
              >
                إضافة فيديو جديد
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden"
                >
                  <div className="aspect-video bg-gray-100 dark:bg-slate-800 relative">
                    {video.thumbnail ? (
                      <Image
                        src={video.thumbnail}
                        alt={video.title}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover"
                      />
                    ) : (

                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        🎬
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                      {formatDuration(video.duration)}
                    </div>
                    {!video.isPublished && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-amber-500 text-white text-xs rounded">
                        مسودة
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-1 truncate">{video.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">{video.course?.title ?? '—'}</p>
                    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-slate-400">
                      <span>{video.views} مشاهدة</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTogglePublish(video)}
                          disabled={publishBusyId === video.id}
                          className={`px-3 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                            video.isPublished
                              ? 'text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {video.isPublished ? 'إخفاء' : 'قبول ونشر'}
                        </button>
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors"
                        >
                          ▶ تشغيل
                        </a>
                        <Link
                          href={`/teacher/videos/${video.id}`}
                          className="px-3 py-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                        >
                          تعديل
                        </Link>
                        <button
                          onClick={() => handleDeleteVideo(video.id)}
                          className="px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
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
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">إضافة فيديو جديد</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-400"
                >
                  ✕
                </button>
              </div>
            </div>
            <form onSubmit={handleAddVideo} className="p-6 space-y-4">
              <div>
                {courses.length === 0 ? (
                  <NoCoursesNotice what="الفيديو" />
                ) : (
                  <>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الدورة</label>
                <select
                  value={newVideo.courseId}
                  onChange={(e) => setNewVideo({ ...newVideo, courseId: e.target.value })}
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">عنوان الفيديو</label>
                <input
                  type="text"
                  value={newVideo.title}
                  onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الوصف</label>
                <textarea
                  value={newVideo.description}
                  onChange={(e) => setNewVideo({ ...newVideo, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  ملف الفيديو (من الهاتف أو الحاسوب)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,video/quicktime,video/*"
                  onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 dark:text-slate-400 file:ml-4 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-indigo-50 dark:file:bg-indigo-500/10 file:dark:bg-indigo-500/10 file:text-indigo-700 dark:file:text-indigo-300 file:dark:text-indigo-300 file:font-medium hover:file:bg-indigo-100 dark:hover:file:bg-indigo-500/15 cursor-pointer"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  الصيغ المدعومة: MP4، WebM، MOV — حتى 200 ميغابايت.
                </p>

                {selectedFile && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between text-sm text-gray-600 dark:text-slate-400">
                      <span className="truncate">{selectedFile.name}</span>
                      <span className="shrink-0">{formatBytes(selectedFile.size)}</span>
                    </div>

                    {previewUrl && (
                      <video
                        src={previewUrl}
                        controls
                        playsInline
                        className="w-full rounded-lg bg-black max-h-56"
                      />
                    )}

                    {!newVideo.url && (
                      <button
                        type="button"
                        onClick={() => void handleUpload()}
                        disabled={uploading}
                        className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                      >
                        {uploading ? `جارٍ الرفع... ${uploadPercent}%` : 'رفع الفيديو'}
                      </button>
                    )}

                    {uploading && (
                      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-2 transition-all"
                          style={{ width: `${uploadPercent}%` }}
                        />
                      </div>
                    )}

                    {newVideo.url && (
                      <p className="text-xs text-green-700 dark:text-emerald-300 bg-green-50 dark:bg-emerald-500/10 border border-green-200 dark:border-emerald-500/30 rounded-lg p-2">
                        تم الرفع بنجاح: {newVideo.url}
                      </p>
                    )}
                  </div>
                )}

                {uploadError && (
                  <p className="mt-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-2">
                    {uploadError}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  أو رابط فيديو خارجي (اختياري)
                </label>
                <input
                  type="url"
                  value={newVideo.url.startsWith('/uploads/') ? '' : newVideo.url}
                  onChange={(e) => setNewVideo({ ...newVideo, url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">رابط الصورة المصغرة</label>
                <input
                  type="url"
                  value={newVideo.thumbnail}
                  onChange={(e) => setNewVideo({ ...newVideo, thumbnail: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">المدة (بالثواني)</label>
                <input
                  type="number"
                  value={newVideo.duration}
                  onChange={(e) => setNewVideo({ ...newVideo, duration: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={adding || uploading || !newVideo.url}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {adding ? 'جاري الإضافة...' : 'إضافة الفيديو'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
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
