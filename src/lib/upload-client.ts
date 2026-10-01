'use client';

import type { UploadKind } from '@/lib/storage/uploads';

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
  kind: UploadKind;
  originalName: string;
  maxBytes: number;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function uploadFile(
  file: File,
  kind: UploadKind,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let payload: { success?: boolean; message?: string; data?: { upload: UploadResult } } = {};

      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('تعذر الاتصال بالخادم'));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload.success && payload.data) {
        resolve(payload.data.upload);
      } else {
        reject(new Error(payload.message || 'فشل رفع الملف'));
      }
    };

    xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء رفع الملف'));
    xhr.onabort = () => reject(new Error('تم إلغاء الرفع'));

    xhr.send(formData);
  });
}

export function readVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const value = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
      URL.revokeObjectURL(video.src);
      resolve(value);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = url;
  });
}
