'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApiData, useSubmit } from '@/lib/hooks/use-api';
import { Card, Button, Badge, Spinner, EmptyState } from '../../_components/ui';

interface AccessCell {
  accessType: string;
  label: string;
  price: number;
  durationDays: number;
  isActive: boolean;
  subscribed: boolean;
}

interface SubjectRow {
  id: string;
  name: string;
  nameAr: string | null;
  icon: string | null;
  color: string | null;
  courseCount: number;
  access: AccessCell[];
}

const ACCESS_ORDER = ['LIVE', 'VIDEO', 'EXERCISE'] as const;

const ACCESS_ICONS: Record<string, string> = {
  LIVE: '📡',
  VIDEO: '🎬',
  EXERCISE: '✏️',
};

const ACCESS_NAMES: Record<string, string> = {
  LIVE: 'البث المباشر',
  VIDEO: 'الفيديوهات المسجلة',
  EXERCISE: 'التمارين',
};

type PendingCell = {
  subjectId: string;
  accessType: string;
  subjectName: string;
};

export default function StudentSubjectsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const { data, error, loading, reload } = useApiData<{ subjects: SubjectRow[] }>(
    '/api/subjects',
    authChecked,
  );
  const subscribe = useSubmit<
    { subjectId: string; accessType: string; paymentMethod: string; transactionId: string; proofUrl?: string },
    { subscription: { id: string } }
  >('/api/subscriptions', 'POST');

  const [manual, setManual] = useState<PendingCell | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'BARIDI' | 'MOB'>('BARIDI');
  const [transactionId, setTransactionId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState('');
  const proofInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  const pickProof = () => proofInputRef.current?.click();

  /*
   * Uploaded straight away rather than after the subscription exists: the
   * endpoint is student-scoped and does not need a subscription id, so there is
   * nothing to wait for, and the URL is then sent with the request. A failure
   * leaves `proofUrl` empty and the subscription still goes through — the
   * receipt is optional and must never be able to block a purchase.
   */
  async function uploadProof(file: File) {
    setProofUploading(true);
    setProofError('');

    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/subscriptions/proof', { method: 'POST', body });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setProofError(json.message || 'تعذر رفع صورة الوصل');
        return;
      }

      setProofUrl(json.data.upload.url);
    } catch {
      setProofError('تعذر الاتصال بالخادم');
    } finally {
      setProofUploading(false);
    }
  }

  /*
   * A locked live-broadcast card links here as `?subject=<id>&access=LIVE`, so
   * the student lands with the dialog already open on the exact cell they came
   * for. Opening it is what turns the card's "اشترك" into a request; without it
   * the student arrives at a catalogue and has to find the right cell.
   *
   * Derived during render rather than set from an effect: the URL and the loaded
   * catalogue are both inputs, not events, and the dialog then closes on its own
   * once the cell reads as subscribed after the reload.
   */
  const wantedSubject = searchParams.get('subject');
  const wantedAccess = searchParams.get('access');
  const autoKey = wantedSubject && wantedAccess ? `${wantedSubject}:${wantedAccess}` : null;

  let auto: PendingCell | null = null;
  if (autoKey && dismissedKey !== autoKey && data?.subjects) {
    const subject = data.subjects.find((row) => row.id === wantedSubject);
    const cell = subject?.access?.find((c) => c.accessType === wantedAccess);
    if (subject && cell && !cell.subscribed) {
      auto = {
        subjectId: subject.id,
        accessType: cell.accessType,
        subjectName: subject.nameAr ?? subject.name,
      };
    }
  }

  const pending = manual ?? auto;

  function closePending() {
    setManual(null);
    if (auto && autoKey) setDismissedKey(autoKey);
    // a half-finished receipt must not follow the student to the next cell
    setProofUrl('');
    setProofError('');
  }

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

  async function handleSubscribe() {
    if (!pending) return;

    const result = await subscribe.submit({
      subjectId: pending.subjectId,
      accessType: pending.accessType,
      paymentMethod,
      transactionId: transactionId.trim(),
      proofUrl: proofUrl || undefined,
    });

    if (result) {
      closePending();
      setTransactionId('');
      reload();
    }
  }

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <Spinner />
      </div>
    );
  }

  const subjects = data?.subjects ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">المواد الدراسية</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1">
          اختر المادة ثم نوع الوصول المطلوب. كل اشتراك مستقل عن الآخر.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl">{error}</div>
      )}

      {!loading && subjects.length === 0 && (
        <EmptyState icon="📚" title="لا توجد مواد متاحة حالياً" />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {subjects.map((subject) => (
          <Card key={subject.id} hover className="overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: subject.color ?? '#E5E7EB' }} />
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: `${subject.color ?? '#4F46E5'}1A` }}
                >
                  {subject.icon ?? '📚'}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                    {subject.nameAr ?? subject.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">{subject.courseCount} دورة</p>
                </div>
              </div>

              <div className="space-y-3">
                {ACCESS_ORDER.map((accessType) => {
                  const cell = subject.access.find((c) => c.accessType === accessType);
                  if (!cell) return null;

                  return (
                    <div
                      key={accessType}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-900/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl">{ACCESS_ICONS[accessType]}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-slate-100 text-sm">{cell.label}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            {cell.price.toLocaleString('ar-DZ')} دج / {cell.durationDays} يوم
                          </p>
                        </div>
                      </div>

                      {cell.subscribed ? (
                        <Badge variant="green">مشترك ✓</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            setManual({
                              subjectId: subject.id,
                              accessType,
                              subjectName: subject.nameAr ?? subject.name,
                            })
                          }
                        >
                          اشترك الآن
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {pending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md space-y-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">إتمام الاشتراك</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {pending.subjectName} — {ACCESS_ICONS[pending.accessType]}{' '}
              {ACCESS_NAMES[pending.accessType]}
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">طريقة الدفع</label>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { value: 'BARIDI', label: 'بريدي موب', hint: 'تحويل CCP' },
                    { value: 'MOB', label: 'موب', hint: 'دفع بالهاتف' },
                  ] as const
                ).map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value)}
                    className={`p-3 rounded-xl border-2 text-right transition-colors${
                      paymentMethod === method.value
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10'
                        : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-slate-100 text-sm">{method.label}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{method.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                رقم العملية أو مرجع التحويل
              </label>
              <input
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="اختياري — يساعد الإدارة على التحقق أسرع"
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

<div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  صورة الوصل
                </label>

                {proofUrl ? (
                  <div className="space-y-2">
                    <div className="relative w-full rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
                      {/* a plain <img>: next/image would need the remote patterns
                          configured, and this is a local upload path */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={proofUrl}
                        alt="صورة الوصل"
                        className="w-full max-h-56 object-contain bg-gray-50 dark:bg-slate-800"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => void pickProof()}
                      >
                        تغيير الصورة
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        className="flex-1"
                        onClick={() => setProofUrl('')}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => void pickProof()}
                      disabled={proofUploading}
                      className="w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 px-4 py-6 text-sm text-gray-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors disabled:opacity-50"
                    >
                      {proofUploading
                        ? 'جارٍ الرفع...'
                        : '📷 ارفع صورة الوصل (اختياري)'}
                    </button>
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
                      صورة تكفي إدارة القمم للتحقق من الدفع أسرع — بريد موب أو موب.
                    </p>
                  </div>
                )}

                {proofError && (
                  <p className="mt-2 text-sm text-red-700 dark:text-red-300">{proofError}</p>
                )}

                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadProof(file);
                    // reset so re-picking the same file still fires onChange
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  لن يتم تفعيل اشتراكك إلا بعد أن تتحقق الإدارة من عملية الدفع.
                </p>
              </div>

            {subscribe.error && (
              <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl text-sm">
                {subscribe.error}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={closePending} className="flex-1">
                إلغاء
              </Button>
              <Button
                onClick={() => void handleSubscribe()}
                disabled={subscribe.submitting}
                className="flex-1"
              >
                {subscribe.submitting ? 'جاري الإرسال...' : 'تأكيد الاشتراك'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}