import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth/auth';
import { registerSchema } from '@/lib/validation/auth';
import { parseBody } from '@/lib/validation/quiz';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    /*
     * parseBody, not `error.message`.
     *
     * A ZodError's own message is the serialised issue array, so passing it
     * through sent the applicant a wall of JSON with the Arabic sentence buried
     * in it:
     *   [ { "code": "custom", "path": ["confirmPassword"], "message": "كلمتا المرور غير متطابقتين" } ]
     * The page renders `data.message` verbatim, so that is literally what a
     * student was shown for typing a password twice.
     */
    const parsed = parseBody(registerSchema, body);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
    }

    const result = await registerUser(parsed.data);

    return NextResponse.json({
      success: true,
      data: result,
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
