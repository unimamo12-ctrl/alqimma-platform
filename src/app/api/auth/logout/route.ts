import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession, clearAuthCookies } from '@/lib/auth/jwt';
import { logoutUser } from '@/lib/auth/auth';

export async function POST() {
  try {
    const session = await getSession();
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh_token')?.value;

    if (session) {
      await logoutUser(session.id, refreshToken);
    }

    await clearAuthCookies();

    return NextResponse.json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح',
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
