import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type UploadKind = 'video' | 'document' | 'image';

export const UPLOAD_LIMITS: Record<UploadKind, number> = {
  video: 200 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  image: 10 * 1024 * 1024,
};

const ALLOWED_MIME: Record<UploadKind, string[]> = {
  video: [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-matroska',
    'video/3gpp',
    'video/x-msvideo',
  ],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
  ],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};

const FALLBACK_MIME = 'application/octet-stream';

export const uploadRoots: Record<UploadKind, string> = {
  video: 'video',
  document: 'file',
  image: 'image',
};

const baseDir = path.join(process.cwd(), 'public', 'uploads');

export function isValidUploadKind(value: string): value is UploadKind {
  return value === 'video' || value === 'document' || value === 'image';
}

export function validateUpload(file: { name: string; type: string; size: number }, kind: UploadKind) {
  if (file.size === 0) {
    return { ok: false as const, message: 'الملف فارغ' };
  }

  const limit = UPLOAD_LIMITS[kind];
  if (file.size > limit) {
    return {
      ok: false as const,
      message: `حجم الملف يتجاوز الحد المسموح (${Math.round(limit / 1024 / 1024)} ميغابايت)`,
    };
  }

  const mime = file.type || FALLBACK_MIME;
  const allowed = ALLOWED_MIME[kind];

  if (mime !== FALLBACK_MIME && !allowed.includes(mime)) {
    return { ok: false as const, message: `نوع الملف غير مدعوم (${mime})` };
  }

  const ext = path.extname(file.name).toLowerCase();
  if (ext && /[^a-z0-9.]/.test(ext)) {
    return { ok: false as const, message: 'اسم الملف يحتوي على أحرف غير مسموحة' };
  }

  return { ok: true as const, mime, ext: ext || '' };
}

export async function saveUpload(
  file: File,
  kind: UploadKind,
  mime: string,
  ext: string,
): Promise<{ url: string; key: string; size: number; mimeType: string }> {
  const folder = uploadRoots[kind];
  const dir = path.join(baseDir, folder);
  await mkdir(dir, { recursive: true });

  const name = `${randomUUID()}${ext}`;
  const target = path.join(dir, name);

  await pipeline(Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(target));

  return {
    url: `/uploads/${folder}/${name}`,
    key: `${folder}/${name}`,
    size: file.size,
    mimeType: mime,
  };
}

export async function removeUpload(key: string) {
  const safe = path.normalize(key).replace(/^([/\\]|\.\.)+/, '');
  const target = path.join(baseDir, safe);

  if (!target.startsWith(baseDir)) return;

  const { unlink } = await import('node:fs/promises');
  await unlink(target).catch(() => undefined);
}

export async function removeLocalUpload(url: string | null | undefined) {
  if (!url || !url.startsWith('/uploads/')) return;
  await removeUpload(url.slice('/uploads/'.length));
}
