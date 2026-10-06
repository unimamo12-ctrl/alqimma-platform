'use client';

import { useState } from 'react';
import { useApiData } from '@/lib/hooks/use-api';
import { Card, Button, Badge } from '../../_components/ui';

interface SubjectRow {
  id: string;
  name: string;
  nameAr: string | null;
  icon: string | null;
  color: string | null;
  _count?: { courses: number };
}

interface LevelRow {
  id: string;
  name: string;
  nameAr: string | null;
  order: number;
  _count?: { courses: number };
}

/**
 * The subject and level catalog.
 *
 * This tab exists because neither had a write route until now, so a deployment
 * that never ran `npm run seed` had an empty catalog with no way to fill it from
 * the browser — and with no subjects or levels a course cannot be created at all,
 * which left "add course" permanently unsendable. Creating a subject also creates
 * its three price cells, since a subject with no prices has nothing to sell.
 */
export function CatalogTab() {
  const subjects = useApiData<{ subjects: SubjectRow[] }>('/api/subjects');
  const levels = useApiData<{ levels: LevelRow[] }>('/api/levels');

  const [subjectName, setSubjectName] = useState('');
  const [subjectNameAr, setSubjectNameAr] = useState('');
  const [subjectIcon, setSubjectIcon] = useState('');
  const [levelName, setLevelName] = useState('');
  const [levelNameAr, setLevelNameAr] = useState('');

  const [busy, setBusy] = useState<'' | 'subject' | 'level'>('');
  const [error, setError] = useState('');
  const [okMessage, setOkMessage] = useState('');

  const subjectList = subjects.data?.subjects ?? [];
  const levelList = levels.data?.levels ?? [];

  async function create(kind: 'subject' | 'level') {
    setBusy(kind);
    setError('');
    setOkMessage('');

    const body =
      kind === 'subject'
        ? { name: subjectName, nameAr: subjectNameAr, icon: subjectIcon }
        : { name: levelName, nameAr: levelNameAr };

    try {
      const res = await fetch(`/api/admin/${kind === 'subject' ? 'subjects' : 'levels'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'تعذّر الحفظ');
        return;
      }

      if (kind === 'subject') {
        setSubjectName('');
        setSubjectNameAr('');
        setSubjectIcon('');
        setOkMessage('تمت إضافة المادة مع أسعارها الافتراضية');
      } else {
        setLevelName('');
        setLevelNameAr('');
        setOkMessage('تمت إضافة المستوى');
      }

      subjects.reload();
      levels.reload();
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setBusy('');
    }
  }

  async function remove(kind: 'subject' | 'level', id: string) {
    setError('');
    setOkMessage('');
    if (!confirm('هل تريد الحذف؟')) return;

    const res = await fetch(`/api/admin/${kind === 'subject' ? 'subjects' : 'levels'}/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();

    if (!res.ok || !json.success) {
      setError(json.message || 'تعذّر الحذف');
      return;
    }

    subjects.reload();
    levels.reload();
  }

  return (
    <div className="space-y-4">
      {(error || okMessage) && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            error
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          }`}
        >
          {error || okMessage}
        </div>
      )}

      <Card className="p-5">
        <h3 className="font-semibold text-gray-900 dark:text-slate-100">المواد</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          تُضاف تلقائيًا خلايا أسعار للبث والفيديو والتمارين.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <input
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="MATH (إنجليزي)"
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
          />
          <input
            value={subjectNameAr}
            onChange={(e) => setSubjectNameAr(e.target.value)}
            placeholder="الرياضيات"
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
          />
          <input
            value={subjectIcon}
            onChange={(e) => setSubjectIcon(e.target.value)}
            placeholder="📐 (اختياري)"
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
          />
          <Button
            onClick={() => void create('subject')}
            disabled={busy !== '' || !subjectName.trim()}
            className="justify-self-start sm:justify-self-auto"
          >
            {busy === 'subject' ? '...حفظ' : 'إضافة مادة'}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {subjectList.length === 0 && subjects.loading === false && (
            <p className="text-sm text-gray-500 dark:text-slate-400">لا توجد مواد بعد.</p>
          )}
          {subjectList.map((subject) => (
            <div
              key={subject.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2"
            >
              {subject.icon && <span className="text-lg">{subject.icon}</span>}
              <span className="font-medium text-sm text-gray-900 dark:text-slate-100">
                {subject.nameAr ?? subject.name}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-500" dir="ltr">
                {subject.name}
              </span>
              <Badge variant="gray">
                {subject._count?.courses ?? 0} دورة
              </Badge>
              <button
                type="button"
                onClick={() => void remove('subject', subject.id)}
                className="mr-auto text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                حذف
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-gray-900 dark:text-slate-100">المستويات</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          مثل <span dir="ltr">3AM</span> أو <span dir="ltr">1AS</span>.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            value={levelName}
            onChange={(e) => setLevelName(e.target.value)}
            placeholder="3AM (إنجليزي)"
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
          />
          <input
            value={levelNameAr}
            onChange={(e) => setLevelNameAr(e.target.value)}
            placeholder="ثالثة متوسط (اختياري)"
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
          />
          <Button
            onClick={() => void create('level')}
            disabled={busy !== '' || !levelName.trim()}
            className="justify-self-start sm:justify-self-auto"
          >
            {busy === 'level' ? '...حفظ' : 'إضافة مستوى'}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {levelList.length === 0 && levels.loading === false && (
            <p className="text-sm text-gray-500 dark:text-slate-400">لا توجد مستويات بعد.</p>
          )}
          {levelList.map((level) => (
            <div
              key={level.id}
              className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2"
            >
              <span className="text-sm font-medium text-gray-900 dark:text-slate-100" dir="ltr">
                {level.name}
              </span>
              {level.nameAr && (
                <span className="text-xs text-gray-500 dark:text-slate-400">{level.nameAr}</span>
              )}
              <Badge variant="gray">{level._count?.courses ?? 0} دورة</Badge>
              <button
                type="button"
                onClick={() => void remove('level', level.id)}
                className="text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                حذف
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}