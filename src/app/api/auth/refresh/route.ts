import { NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/auth/jwt';

export async function POST() {
  try {
    const newToken = await refreshAccessToken();

    if (!newToken) {
      return NextResponse.json(
        { success: false, message: 'جلسة غير صالحة' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
