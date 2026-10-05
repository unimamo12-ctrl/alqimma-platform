import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/jwt';
import { changePassword } from '@/lib/auth/auth';
import { changePasswordSchema } from '@/lib/validation/auth';
import { parseBody } from '@/lib/validation/quiz';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // parseBody, not `error.message` — a ZodError's message is the serialised
    // issue array, so it reached the page as raw JSON instead of the Arabic
    // sentence the schema already carries.
    const parsed = parseBody(changePasswordSchema, body);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
    }

    await changePassword(session.id, parsed.data.currentPassword, parsed.data.newPassword);

    return NextResponse.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح',
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
