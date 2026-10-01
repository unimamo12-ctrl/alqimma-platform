import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/jwt';
import { saveUpload, validateUpload } from '@/lib/storage/uploads';

export const maxDuration = 60;

/**
 * Upload the photo of a payment receipt.
 *
 * Deliberately not `/api/uploads`: that route is teacher/admin, and opening it to
 * students would let any of them push arbitrary images into the platform. This one
 * is student-only and always `kind=image`, so the only thing a student can upload
 * is a receipt, and it is capped at the image limit (10MB) rather than the video
 * or document ones.
 *
 * The URL that comes back is not trusted later on its own: `POST /api/subscriptions`
 * re-checks that it starts with `/uploads/image/`, so a hand-crafted value in the
 * request cannot turn the admin's browser into a fetcher for an arbitrary host.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'STUDENT' || !session.student) {
      return NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول كطالب' },
        { status: 401 },
      );
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: 'لم يتم استلام أي ملف' },
        { status: 400 },
      );
    }

    const check = validateUpload(file, 'image');
    if (!check.ok) {
      return NextResponse.json({ success: false, message: check.message }, { status: 400 });
    }

    const saved = await saveUpload(file, 'image', check.mime, check.ext);

    return NextResponse.json({
      success: true,
      data: { upload: saved },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}