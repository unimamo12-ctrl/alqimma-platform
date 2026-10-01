'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiData } from '@/lib/hooks/use-api';
import { Card, Badge, Spinner, EmptyState } from '../../_components/ui';

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  status: string;
  transactionId: string | null;
  createdAt: string;
}

interface SubscriptionRow {
  id: string;
  status: string;
  accessType: string;
  accessLabel: string;
  startDate: string;
  endDate: string;
  subject: { id: string; name: string; nameAr: string | null; icon: string | null };
  payments: PaymentRow[];
}

const STATUS_STYLES: Record<
  string,
  { variant: 'amber' | 'green' | 'red' | 'gray'; label: string }
> = {
  PENDING: { variant: 'amber', label: 'بانتظار تحقق الإدارة' },
  ACTIVE: { variant: 'green', label: 'نشط' },
  REJECTED: { variant: 'red', label: 'مرفوض' },
  EXPIRED: { variant: 'gray', label: 'منتهي' },
  CANCELLED: { variant: 'gray', label: 'ملغي' },
};

const METHOD_LABELS: Record<string, string> = {
  BARIDI: 'بريدي موب',
  MOB: 'موب',
};

export default function StudentSubscriptionsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const { data, error, loading } = useApiData<{ subscriptions: SubscriptionRow[] }>(
    '/api/subscriptions/mine',
    authChecked,
  );

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success || json.data?.user.role !== 'STUDENT') {
          router.replace('/login');
          return;
        }
        setAuthChecked(true);
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <Spinner />
      </div>
    );
  }

  const subscriptions = data?.subscriptions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">اشتراكاتي</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">اشتراكاتك في المواد وحالة كل طلب</p>
        </div>
        <Link
          href="/student/subjects"
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
        >
          اشترك في مادة
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl">{error}</div>
      )}

      {!loading && subscriptions.length === 0 && (
        <EmptyState
          icon="💳"
          title="ليس لديك أي اشتراكات بعد"
          description="اشترك في مادة للوصول إلى محتواها"
          action={
            <Link
              href="/student/subjects"
              className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            >
              تصفح المواد
            </Link>
          }
        />
      )}

      {subscriptions.length > 0 && (
        <div className="space-y-4">
          {subscriptions.map((sub) => {
            const isActive = sub.status === 'ACTIVE' && new Date(sub.endDate) > new Date();
            const statusInfo = STATUS_STYLES[sub.status] ?? {
              variant: 'gray' as const,
              label: sub.status,
            };

            return (
              <Card key={sub.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{sub.subject.icon ?? '📚'}</span>
                    <div>
                      <h2 className="font-semibold text-gray-900 dark:text-slate-100">
                        {sub.subject.nameAr ?? sub.subject.name}
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-slate-400">{sub.accessLabel}</p>
                    </div>
                  </div>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 text-sm mb-3">
                  <div className="text-gray-600 dark:text-slate-400">
                    <span className="text-gray-400 dark:text-slate-500">من:</span>{' '}
                    <span dir="ltr">{new Date(sub.startDate).toLocaleDateString('ar-DZ')}</span>
                  </div>
                  <div className="text-gray-600 dark:text-slate-400">
                    <span className="text-gray-400 dark:text-slate-500">إلى:</span>{' '}
                    <span dir="ltr">{new Date(sub.endDate).toLocaleDateString('ar-DZ')}</span>
                  </div>
                </div>

                {sub.payments.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-slate-800 pt-3 mb-3 space-y-2">
                    {sub.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-gray-600 dark:text-slate-400">
                          {payment.amount.toLocaleString('ar-DZ')} دج —{' '}
                          {METHOD_LABELS[payment.method] ?? payment.method}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          {payment.transactionId ? `مرجع: ${payment.transactionId} — ` : ''}
                          <span dir="ltr">
                            {new Date(payment.createdAt).toLocaleDateString('ar-DZ')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {sub.status === 'PENDING' && (
                  <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 mb-3">
                    طلبك قيد المراجعة. سيتم التفعيل بعد أن تتحقق الإدارة من الدفع.
                  </p>
                )}

                {isActive && (
                  <div className="flex flex-wrap gap-2">
                    {sub.accessType === 'LIVE' && (
                      <Link
                        href="/student/live"
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                      >
                        دخول البث المباشر
                      </Link>
                    )}
                    {sub.accessType === 'VIDEO' && (
                      <Link
                        href="/student/videos"
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                      >
                        مشاهدة الفيديوهات
                      </Link>
                    )}
                    {sub.accessType === 'EXERCISE' && (
                      <Link
                        href="/student/exercises"
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                      >
                        حل التمارين
                      </Link>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}