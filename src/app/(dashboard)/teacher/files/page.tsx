'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/hooks/use-api';
import Link from 'next/link';
import { NoCoursesNotice } from '../_components/no-courses-notice';
import { formatBytes, uploadFile } from '@/lib/upload-client';

const ACCEPTED_DOCS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.zip',
];

interface FileItem {
  id: string;
  name: string;
  description: string | null;
  url: string;
  fileType: string;
  size: number;
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

export default function TeacherFilesPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFile, setNewFile] = useState({
    courseId: '',
    name: '',
    description: '',
    url: '',
    fileType: 'PDF',
    size: 0,
  });
  const [adding, setAdding] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setNewFile({ courseId: '', name: '', description: '', url: '', fileType: 'PDF', size: 0 });
    setSelectedFile(null);
    setUploadPercent(0);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const detectFileType = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return 'PDF';
    if (['doc', 'docx'].includes(ext)) return 'WORD';
    if (['ppt', 'pptx'].includes(ext)) return 'POWERPOINT';
    if (['xls', 'xlsx'].includes(ext)) return 'EXCEL';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'IMAGE';
    return 'OTHER';
  };

  const handlePickFile = (file: File | null) => {
    setUploadError('');

    if (!file) {
      setSelectedFile(null);
      setNewFile((prev) => ({ ...prev, url: '' }));
      return;
    }

    setSelectedFile(file);
    setNewFile((prev) => ({
      ...prev,
      url: '',
      name: prev.name || file.name.replace(/\.[^.]+$/, ''),
      fileType: detectFileType(file.name),
    }));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('اختر ملفًا من الهاتف أو الحاسوب أولًا');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const upload = await uploadFile(selectedFile, 'document', setUploadPercent);
      setNewFile((prev) => ({ ...prev, url: upload.url, size: upload.size }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'فشل رفع الملف');
    } finally {
      setUploading(false);
    }
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
      fetch(`/api/files?teacherId=${user.teacher.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setFiles(data.data.files);
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

  const handleAddFile = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFile),
      });

      const data = await res.json();

      if (data.success) {
        setFiles([data.data.file, ...files]);
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

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الملف؟')) return;

    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        setFiles(files.filter((f) => f.id !== fileId));
      } else {
        alert(data.message);
      }
    } catch {
      alert('حدث خطأ في الاتصال');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'PDF':
        return '📄';
      case 'WORD':
      case 'DOC':
      case 'DOCX':
        return '📝';
      case 'POWERPOINT':
      case 'PPT':
      case 'PPTX':
        return '📊';
      case 'IMAGE':
      case 'JPG':
      case 'PNG':
        return '🖼️';
      default:
        return '📎';
    }
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
            <Link href="/teacher/files" className="flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 rounded-xl">
              <span>📁</span>
              <span className="font-medium">الملفات</span>
            </Link>
            <Link href="/teacher/exercises" className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors">
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
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">إدارة الملفات</h1>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              + إضافة ملف
            </button>
          </div>
        </header>

        <div className="p-8">
          {files.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📁</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">لا توجد ملفات</h3>
              <p className="text-gray-600 dark:text-slate-400 mb-6">ابدأ بإضافة ملف جديد لطلابك</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
              >
                إضافة ملف جديد
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700">
                    <tr>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500 dark:text-slate-400">الملف</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500 dark:text-slate-400">الدورة</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500 dark:text-slate-400">النوع</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500 dark:text-slate-400">الحجم</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500 dark:text-slate-400">التاريخ</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500 dark:text-slate-400">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {files.map((file) => (
                      <tr key={file.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{getFileIcon(file.fileType)}</span>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-slate-100">{file.name}</div>
                              {file.description && (
                                <div className="text-sm text-gray-500 dark:text-slate-400 truncate max-w-xs">
                                  {file.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">{file.course?.title ?? '—'}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded text-xs font-medium">
                            {file.fileType}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">{formatFileSize(file.size)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">
                          {new Date(file.createdAt).toLocaleDateString('ar-DZ')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors text-sm"
                            >
                              فتح
                            </a>
                            <button
                              onClick={() => handleDeleteFile(file.id)}
                              className="px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors text-sm"
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
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">إضافة ملف جديد</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-400"
                >
                  ✕
                </button>
              </div>
            </div>
            <form onSubmit={handleAddFile} className="p-6 space-y-4">
              <div>
                {courses.length === 0 ? (
                  <NoCoursesNotice what="الملف" />
                ) : (
                  <>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الدورة</label>
                <select
                  value={newFile.courseId}
                  onChange={(e) => setNewFile({ ...newFile, courseId: e.target.value })}
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">اسم الملف</label>
                <input
                  type="text"
                  value={newFile.name}
                  onChange={(e) => setNewFile({ ...newFile, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الوصف</label>
                <textarea
                  value={newFile.description}
                  onChange={(e) => setNewFile({ ...newFile, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  الملف (من الهاتف أو الحاسوب)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_DOCS.join(',')}
                  onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 dark:text-slate-400 file:ml-4 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-indigo-50 dark:file:bg-indigo-500/10 file:dark:bg-indigo-500/10 file:text-indigo-700 dark:file:text-indigo-300 file:dark:text-indigo-300 file:font-medium hover:file:bg-indigo-100 dark:hover:file:bg-indigo-500/15 cursor-pointer"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  PDF، Word، PowerPoint، Excel، ZIP — حتى 50 ميغابايت.
                </p>

                {selectedFile && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between text-sm text-gray-600 dark:text-slate-400">
                      <span className="truncate">{selectedFile.name}</span>
                      <span className="shrink-0">{formatBytes(selectedFile.size)}</span>
                    </div>

                    {!newFile.url && (
                      <button
                        type="button"
                        onClick={() => void handleUpload()}
                        disabled={uploading}
                        className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                      >
                        {uploading ? `جارٍ الرفع... ${uploadPercent}%` : 'رفع الملف'}
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

                    {newFile.url && (
                      <p className="text-xs text-green-700 dark:text-emerald-300 bg-green-50 dark:bg-emerald-500/10 border border-green-200 dark:border-emerald-500/30 rounded-lg p-2">
                        تم الرفع بنجاح: {newFile.url}
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
                  أو رابط ملف خارجي (اختياري)
                </label>
                <input
                  type="url"
                  value={newFile.url.startsWith('/uploads/') ? '' : newFile.url}
                  onChange={(e) => setNewFile({ ...newFile, url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">نوع الملف</label>
                  <select
                    value={newFile.fileType}
                    onChange={(e) => setNewFile({ ...newFile, fileType: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="PDF">PDF</option>
                    <option value="WORD">Word</option>
                    <option value="POWERPOINT">PowerPoint</option>
                    <option value="EXCEL">Excel</option>
                    <option value="IMAGE">صورة</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الحجم (بالبايت)</label>
                  <input
                    type="number"
                    value={newFile.size}
                    onChange={(e) => setNewFile({ ...newFile, size: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={adding || uploading || !newFile.url}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {adding ? 'جاري الإضافة...' : 'إضافة الملف'}
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
