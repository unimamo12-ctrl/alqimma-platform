'use client';

import { useMemo, useState } from 'react';
import { AdminShell, useAdminGuard, Loading } from '../_components/shell';
import { useApiData, useSubmit } from '@/lib/hooks/use-api';
import { Card, Button, Badge, EmptyState } from '../../_components/ui';

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  status: string;
  transactionId: string | null;
  /** photo of the transfer receipt; a local /uploads/image/... path or null */
  proofUrl: string | null;
  createdAt: string;
}

interface SubscriptionRow {
  id: string;
  status: string;
  accessType: string;
  accessLabel: string;
  startDate: string;
  endDate: string;
  subject: { id: string; name: string; nameAr: string | null };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    user: { email: string };
  };
  payments: PaymentRow[];
}

type Tab = 'pending' | 'all' | 'payments' | 'pricing';

const STATUS_STYLES: Record<
  string,
  { variant: 'amber' | 'green' | 'red' | 'gray'; label: string }
> = {
  PENDING: { variant: 'amber', label: 'بانتظار التحقق' },
  ACTIVE: { variant: 'green', label: 'نشط' },
  REJECTED: { variant: 'red', label: 'مرفوض' },
  EXPIRED: { variant: 'gray', label: 'منتهي' },
  CANCELLED: { variant: 'gray', label: 'ملغي' },
};

const METHOD_LABELS: Record<string, string> = {
  BARIDI: 'بريدي موب',
  MOB: 'موب',
};

interface PricingRow {
  id: string;
  subjectId: string;
  accessType: string;
  label: string;
  price: number;
  durationDays: number;
  isActive: boolean;
  subscriptionCount: number;
}

interface SubjectOption {
  id: string;
  name: string;
  nameAr: string | null;
}

export default function AdminSubscriptionsPage() {
  const ready = useAdminGuard();
  const [tab, setTab] = useState<Tab>('pending');

  const { data, error, loading, reload } = useApiData<{
    subscriptions: SubscriptionRow[];
  }>('/api/admin/subscriptions', ready);

  const paymentsData = useApiData<{
    payments: Array<PaymentRow & { subscription: SubscriptionRow }>;
  }>('/api/admin/payments', ready && tab === 'payments');

  const pricingData = useApiData<{
    subjects: SubjectOption[];
    access: PricingRow[];
  }>('/api/admin/subject-access', ready && tab === 'pricing');

  const subscriptions = useMemo(() => data?.subscriptions ?? [], [data]);
  const pending = subscriptions.filter((s) => s.status === 'PENDING');

  async function handleDecision(id: string, action: 'APPROVE' | 'REJECT') {
    const res = await fetch(`/api/admin/subscriptions/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();

    if (json.success) {
      reload();
    } else {
      alert(json.message || 'حدث خطأ');
    }
  }

  if (!ready) return <AdminShell><Loading /></AdminShell>;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">الاشتراكات والدفع</h2>
          {pending.length > 0 && (
            <span className="text-xs px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
              {pending.length} طلب بانتظار التحقق
            </span>
          )}
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700">
          {(
            [
              { key: 'pending' as Tab, label: `بانتظار التحقق (${pending.length})` },
              { key: 'all' as Tab, label: `الكل (${subscriptions.length})` },
              { key: 'payments' as Tab, label: 'المدفوعات' },
              { key: 'pricing' as Tab, label: 'الأسعار' },
            ]
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors${
                tab === item.key
                  ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
        )}

        {loading && tab !== 'payments' && tab !== 'pricing' ? (
          <Loading />
        ) : tab === 'pending' ? (
          pending.length === 0 ? (
            <EmptyState icon="✅" title="لا توجد طلبات بانتظار التحقق" />
          ) : (
            <div className="space-y-4">
              {pending.map((sub) => {
                const statusInfo = STATUS_STYLES[sub.status] ?? {
                  variant: 'gray' as const,
                  label: sub.status,
                };
                return (
                  <Card key={sub.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-slate-100">
                          {sub.student.firstName} {sub.student.lastName}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400">{sub.student.user.email}</p>
                      </div>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3 text-sm mb-4">
                      <div className="text-gray-600 dark:text-slate-400">
                        <span className="text-gray-400 dark:text-slate-500">المادة:</span>{' '}
                        {sub.subject.nameAr ?? sub.subject.name}
                      </div>
                      <div className="text-gray-600 dark:text-slate-400">
                        <span className="text-gray-400 dark:text-slate-500">الوصول:</span> {sub.accessLabel}
                      </div>
                      <div className="text-gray-600 dark:text-slate-400">
                        <span className="text-gray-400 dark:text-slate-500">المدة:</span> حتى{' '}
                        <span dir="ltr">{new Date(sub.endDate).toLocaleDateString('ar-DZ')}</span>
                      </div>
                    </div>

                    {sub.payments.length > 0 && (
                      <div className="border-t border-gray-100 dark:border-slate-800 pt-3 mb-4 space-y-2">
                        {sub.payments.map((p) => (
                          <div
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-sm"
                          >
                            <span className="text-gray-600 dark:text-slate-400">
                              {p.amount.toLocaleString('ar-DZ')} دج —{' '}
                              {METHOD_LABELS[p.method] ?? p.method}
                            </span>
<span className="text-xs text-gray-400 dark:text-slate-500">
                                {p.transactionId ? `مرجع: ${p.transactionId}` : 'بدون مرجع'}
                              </span>
                              {/*
                               * The receipt is what makes approval a decision
                               * rather than a guess, so it has to be visible
                               * here: a thumbnail inline, and the full image on
                               * click. `proofUrl` is only ever a local
                               * /uploads/image/ path — the API rejects anything
                               * else — so this cannot fetch a third-party host.
                               */}
                              {p.proofUrl && (
                                <a
                                  href={p.proofUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="فتح صورة الوصل"
                                  className="shrink-0"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={p.proofUrl}
                                    alt="صورة الوصل"
                                    className="h-12 w-12 rounded-lg border border-gray-200 dark:border-slate-700 object-cover hover:opacity-80 transition-opacity"
                                  />
                                </a>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        onClick={() => void handleDecision(sub.id, 'APPROVE')}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        قبول وتفعيل
                      </Button>
                      <Button variant="danger" onClick={() => void handleDecision(sub.id, 'REJECT')}>
                        رفض
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        ) : tab === 'all' ? (
          subscriptions.length === 0 ? (
            <EmptyState icon="📋" title="لا توجد اشتراكات" />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                  <tr>
                    <th className="text-right font-medium px-4 py-3">الطالب</th>
                    <th className="text-right font-medium px-4 py-3">المادة</th>
                    <th className="text-right font-medium px-4 py-3">الوصول</th>
                    <th className="text-right font-medium px-4 py-3">النهاية</th>
                    <th className="text-right font-medium px-4 py-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {subscriptions.map((sub) => {
                    const statusInfo = STATUS_STYLES[sub.status] ?? {
                      variant: 'gray' as const,
                      label: sub.status,
                    };
                    return (
                      <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-3 text-gray-900 dark:text-slate-100">
                          {sub.student.firstName} {sub.student.lastName}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                          {sub.subject.nameAr ?? sub.subject.name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{sub.accessLabel}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-400" dir="ltr">
                          {new Date(sub.endDate).toLocaleDateString('ar-DZ')}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )
        ) : tab === 'payments' ? (
          <PaymentsTab data={paymentsData} />
        ) : (
          <PricingTab data={pricingData} />
        )}
      </div>
    </AdminShell>
  );
}

function PaymentsTab({
  data,
}: {
  data: ReturnType<
    typeof useApiData<{ payments: Array<PaymentRow & { subscription: SubscriptionRow }> }>
  >;
}) {
  const payments = data?.data?.payments ?? [];

  if (data?.loading) return <Loading />;
  if (payments.length === 0) {
    return <EmptyState icon="💰" title="لا توجد مدفوعات" />;
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
          <tr>
            <th className="text-right font-medium px-4 py-3">الطالب</th>
            <th className="text-right font-medium px-4 py-3">المادة</th>
            <th className="text-right font-medium px-4 py-3">المبلغ</th>
            <th className="text-right font-medium px-4 py-3">الطريقة</th>
            <th className="text-right font-medium px-4 py-3">المرجع</th>
            <th className="text-right font-medium px-4 py-3">الحالة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
          {payments.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
              <td className="px-4 py-3 text-gray-900 dark:text-slate-100">
                {p.subscription
                  ? `${p.subscription.student.firstName} ${p.subscription.student.lastName}`
                  : '—'}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                {p.subscription
                  ? (p.subscription.subject.nameAr ?? p.subscription.subject.name)
                  : '—'}
              </td>
              <td className="px-4 py-3 text-gray-900 dark:text-slate-100">
                {p.amount.toLocaleString('ar-DZ')} دج
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{METHOD_LABELS[p.method] ?? p.method}</td>
              <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">{p.transactionId ?? '—'}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    p.status === 'COMPLETED' ? 'green' : p.status === 'FAILED' ? 'red' : 'amber'
                  }
                >
                  {p.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PricingTab({
  data,
}: {
  data: ReturnType<typeof useApiData<{ subjects: SubjectOption[]; access: PricingRow[] }>>;
}) {
  const subjects = data?.data?.subjects ?? [];
  const access = data?.data?.access ?? [];
  const [editing, setEditing] = useState<PricingRow | null>(null);
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('30');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');

  const save = useSubmit<
    {
      subjectId: string;
      accessType: string;
      price: number;
      durationDays: number;
      isActive: boolean;
    },
    { access: PricingRow }
  >('/api/admin/subject-access', 'POST');

  function openEditor(cell: PricingRow) {
    setEditing(cell);
    setPrice(String(cell.price));
    setDuration(String(cell.durationDays));
    setIsActive(cell.isActive);
    setFormError('');
    setSaved('');
    save.setError('');
  }

  function closeEditor() {
    setEditing(null);
    setFormError('');
    setSaved('');
  }

  async function handleSave() {
    if (!editing) return;

    // Validate here instead of sending the raw fields. `z.coerce.number()` on the
    // server turns an empty string into 0, so a cleared price box would otherwise
    // save as "0 دج" and quietly make the course free.
    const priceValue = Number(price);
    const durationValue = Number(duration);

    if (price.trim() === '' || !Number.isFinite(priceValue) || priceValue < 0) {
      setFormError('أدخل سعرًا صحيحًا (رقم 0 أو أكثر)');
      return;
    }
    if (
      duration.trim() === '' ||
      !Number.isInteger(durationValue) ||
      durationValue < 1 ||
      durationValue > 3650
    ) {
      setFormError('أدخل مدة صحيحة: عدد أيام بين 1 و 3650');
      return;
    }

    const result = await save.submit({
      subjectId: editing.subjectId,
      accessType: editing.accessType,
      price: priceValue,
      durationDays: durationValue,
      isActive,
    });

    if (!result) return;

    // Patch the row in place from the server's own response. Without this the
    // table kept rendering the pre-edit price after a successful save, because
    // nothing refetched the catalog — the save looked like it had done nothing.
    data?.setData((prev) => {
      if (!prev) return prev;

      const saved = { ...result.access, subscriptionCount: editing.subscriptionCount };
      const exists = prev.access.some(
        (row) => row.subjectId === saved.subjectId && row.accessType === saved.accessType,
      );

      return {
        ...prev,
        access: exists
          ? prev.access.map((row) =>
              row.subjectId === saved.subjectId && row.accessType === saved.accessType
                ? saved
                : row,
            )
          : [...prev.access, saved],
      };
    });

    setSaved(`تم حفظ سعر ${result.access.label} عند ${result.access.price.toLocaleString('ar-DZ')} دج`);
    setEditing(null);
  }

  if (data?.loading) return <Loading />;

  return (
    <div className="space-y-4">
      {editing && (
        <Card className="p-5 space-y-4 border-indigo-200 dark:border-indigo-500/30">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-semibold text-gray-900 dark:text-slate-100">
              تعديل: {editing.label} —{' '}
              {subjects.find((s) => s.id === editing.subjectId)?.nameAr ??
                subjects.find((s) => s.id === editing.subjectId)?.name}
            </h3>
            <button
              type="button"
              onClick={closeEditor}
              className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
            >
              ✕
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">السعر (دج)</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={50}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">المدة (يوم)</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={3650}
                step={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">الحالة</label>
              <select
                value={isActive ? '1' : '0'}
                onChange={(e) => setIsActive(e.target.value === '1')}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="1">مفعّل — ظاهر للطالب</option>
                <option value="0">معطّل — مخفي ولا يُشترى</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            التعطيل يمنع الاشتراك الجديد فقط ولا يلغي اشتراكات الطلاب الحالية.
          </p>
          {(formError || save.error) && (
            <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl text-sm">
              {formError || save.error}
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={closeEditor}>
              إلغاء
            </Button>
            <Button onClick={() => void handleSave()} disabled={save.submitting}>
              {save.submitting ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </Card>
      )}

      {saved && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-xl text-sm">
          {saved}
        </div>
      )}

      <Card className="p-5">
        <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-4">أسعار الوصول</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
          حدد سعر ومدة كل نوع وصول لكل مادة. الطالب يرى هذه الأسعار عند الاشتراك.
        </p>

        {access.length === 0 ? (
          <EmptyState
            icon="price"
            title="لا توجد أسعار محددة"
            description="أضف أسعارًا من إعدادات المواد لتظهر هنا."
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
              <tr>
                <th className="text-right font-medium px-4 py-3">المادة</th>
                <th className="text-right font-medium px-4 py-3">الوصول</th>
                <th className="text-right font-medium px-4 py-3">السعر (دج)</th>
                <th className="text-right font-medium px-4 py-3">المدة (يوم)</th>
                <th className="text-right font-medium px-4 py-3">الحالة</th>
                <th className="text-right font-medium px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {access.map((cell) => (
                <tr key={cell.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-gray-900 dark:text-slate-100">
                    {subjects.find((s) => s.id === cell.subjectId)?.nameAr ??
                      subjects.find((s) => s.id === cell.subjectId)?.name ??
                      cell.subjectId}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{cell.label}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-slate-100">
                    {cell.price.toLocaleString('ar-DZ')}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{cell.durationDays}</td>
                  <td className="px-4 py-3">
                    <Badge variant={cell.isActive ? 'green' : 'gray'}>
                      {cell.isActive ? 'مفعّل' : 'معطّل'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEditor(cell)}
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-sm font-medium"
                    >
                      تعديل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}