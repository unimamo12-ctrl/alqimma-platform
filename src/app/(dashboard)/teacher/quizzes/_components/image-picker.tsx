'use client';

import { useRef, useState } from 'react';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Uploads a picture through /api/uploads (kind=image) and hands back its public
 * URL. Kept deliberately small: the quiz editor is the only consumer, and the
 * teacher is already the one who may call that endpoint.
 */
export function ImagePicker({
  value,
  onChange,
  disabled,
  label = 'رفع صورة',
}: {
  value: string;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (file: File) => {
    setError('');

    if (!file.type.startsWith('image/')) {
      setError('الملف المختار ليس صورة');
      return;
    }

    if (file.size > MAX_BYTES) {
      setError('حجم الصورة يتجاوز 10 ميغابايت');
      return;
    }

    setBusy(true);

    try {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', 'image');

      const res = await fetch('/api/uploads', { method: 'POST', body });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message ?? 'تعذر رفع الصورة');
        return;
      }

      onChange(json.data.upload.url as string);
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setBusy(false);
      // lets the teacher pick the same file again after a failure
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 dark:border-slate-700 object-cover bg-gray-50 dark:bg-slate-900/60"
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void pick(file);
            }}
          />

          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60 disabled:opacity-40"
          >
            {busy ? 'جارٍ الرفع…' : value ? 'تغيير الصورة' : label}
          </button>

          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="px-3 py-1.5 rounded-lg text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              إزالة
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
