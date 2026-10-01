import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherOrAdmin, serverError } from '@/lib/auth/guards';
import {
  isValidUploadKind,
  saveUpload,
  UPLOAD_LIMITS,
  validateUpload,
  type UploadKind,
} from '@/lib/storage/uploads';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const guard = await requireTeacherOrAdmin();
    if (!guard.ok) return guard.response;

    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: 'لم يتم استلام أي ملف' },
        { status: 400 }
      );
    }

    const rawKind = String(formData?.get('kind') ?? 'document');
    const kind: UploadKind = isValidUploadKind(rawKind) ? rawKind : 'document';

    const check = validateUpload(file, kind);
    if (!check.ok) {
      return NextResponse.json({ success: false, message: check.message }, { status: 400 });
    }

    const saved = await saveUpload(file, kind, check.mime, check.ext);

    return NextResponse.json({
      success: true,
      data: {
        upload: {
          ...saved,
          kind,
          originalName: file.name,
          maxBytes: UPLOAD_LIMITS[kind],
        },
      },
    });
  } catch {
    return serverError();
  }
}
