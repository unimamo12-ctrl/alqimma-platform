'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApiData } from '@/lib/hooks/use-api';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

export default function StudentNotificationsPage() {
  const router = useRouter();
  const { data, setData } = useApiData<{
    notifications: Notification[];
    unreadCount: number;
  }>('/api/notifications');
  const [authChecked, setAuthChecked] = useState(false);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const loading = !authChecked || !data;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const json = await res.json();

        if (cancelled) return;

        if (!json.success) {
          router.push('/login');
          return;
        }

        setAuthChecked(true);
      } catch {
        if (!cancelled) router.push('/login');
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const markAsRead = (notificationId: string) => {
    fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, isRead: true }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  notifications: prev.notifications.map((n) =>
                    n.id === notificationId ? { ...n, isRead: true } : n
                  ),
                  unreadCount: Math.max(0, prev.unreadCount - 1),
                }
              : prev
          );
        }
      })
      .catch(() => {});
  };

  const markAllAsRead = () => {
    fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: true }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  notifications: prev.notifications.map((n) => ({ ...n, isRead: true })),
                  unreadCount: 0,
                }
              : prev
          );
        }
      })
      .catch(() => {});
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'LIVE_STARTED':
        return '📡';
      case 'LIVE_REMINDER':
        return '⏰';
      case 'NEW_LESSON':
        return '🎥';
      case 'NEW_FILE':
        return '📁';
      case 'SUBSCRIPTION_ACCEPTED':
        return '✅';
      case 'SUBSCRIPTION_EXPIRED':
        return '⚠️';
      case 'ANNOUNCEMENT':
        return '📢';
      default:
        return '🔔';
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
              <Link href="/student" className="text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors">
                لوحة التحكم
              </Link>
              <Link href="/login" className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors">
                تسجيل الخروج
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">الإشعارات</h1>
            <p className="text-gray-600 dark:text-slate-400">
              {unreadCount > 0 ? `لديك ${unreadCount} إشعار غير مقروء` : 'لا توجد إشعارات جديدة'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg font-medium transition-colors"
            >
              تحديد الكل كمقروء
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔔</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">لا توجد إشعارات</h3>
            <p className="text-gray-600 dark:text-slate-400">ستظهر الإشعارات هنا عند وجودها</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl p-6 border transition-all${
                  notification.isRead
                    ? 'border-gray-100 dark:border-slate-800'
                    : 'border-indigo-200 bg-indigo-50/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/15 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-slate-100">{notification.title}</h3>
                      {!notification.isRead && (
                        <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-gray-600 dark:text-slate-400 mt-1">{notification.message}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm text-gray-500 dark:text-slate-400">
                        {new Date(notification.createdAt).toLocaleDateString('ar-DZ', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <div className="flex items-center gap-2">
                        {notification.link && (
                          <Link
                            href={notification.link}
                            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium"
                          >
                            عرض التفاصيل
                          </Link>
                        )}
                        {!notification.isRead && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
                          >
                            تحديد كمقروء
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
