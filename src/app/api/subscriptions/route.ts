import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { isAccessType } from '@/lib/subscriptions/access';

const PAYMENT_METHODS = ['BARIDI', 'MOB'] as const;

/*
 * The receipt photo is only accepted as a local `/uploads/image/...` path.
 * Without this check the field is an open proxy: a student could submit
 * `https://elsewhere/x.png` and the admin panel would happily render it, which
 * both leaks the admin's IP to a third party and turns the panel into a request
 * forgery gadget. Same rule the quiz image fields use.
 */
const proofUrlField = z
  .string()
  .trim()
  .regex(/^\/uploads\/image\/[A-Za-z0-9._-]+$/, 'صورة الوصل غير صالحة')
  .max(200)
  .optional()
  .or(z.literal(''));

const subscribeSchema = z.object({
  subjectId: z.string().min(1, 'المادة مطلوبة'),
  accessType: z.string().refine(isAccessType, 'نوع الوصول غير صالح'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  transactionId: z.string().trim().max(120).optional().or(z.literal('')),
  proofUrl: proofUrlField,
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'STUDENT' || !session.student) {
      return NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول كطالب' },
        { status: 401 },
      );
    }

    const studentId = session.student.id;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'طلب غير صالح' },
        { status: 400 },
      );
    }

    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const { subjectId, accessType, paymentMethod, transactionId, proofUrl } = parsed.data;

    const cell = await prisma.subjectAccess.findUnique({
      where: { subjectId_accessType: { subjectId, accessType } },
    });

    if (!cell || !cell.isActive) {
      return NextResponse.json(
        { success: false, message: 'هذه المادة غير متاحة للاشتراك' },
        { status: 404 },
      );
    }

    // The composite unique makes a duplicate request impossible to store, but
    // the error it raises is a raw unique-violation. Catching it here lets us
    // tell the student they already asked, rather than showing a 500.
    const existing = await prisma.subscription.findUnique({
      where: {
        studentId_subjectId_accessType: { studentId, subjectId, accessType },
      },
      select: { id: true, status: true, endDate: true },
    });

    if (existing) {
      const active = existing.status === 'ACTIVE' && existing.endDate > new Date();
      return NextResponse.json(
        {
          success: false,
          message: active
            ? 'لديك اشتراك نشط بالفعل في هذه المادة'
            : 'لديك طلب اشتراك قيد المراجعة بالفعل',
          data: { subscription: existing },
        },
        { status: 409 },
      );
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + cell.durationDays * 24 * 60 * 60 * 1000);

    const subscription = await prisma.subscription.create({
      data: {
        studentId,
        subjectId,
        accessType,
        startDate,
        endDate,
        status: 'PENDING',
payments: {
            create: {
              amount: cell.price,
              method: paymentMethod,
              status: 'PENDING',
              transactionId: transactionId || null,
              proofUrl: proofUrl || null,
            },
          },
      },
      include: {
        payments: true,
        subject: { select: { id: true, name: true, nameAr: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'تم إرسال طلب الاشتراك. سيتم تفعيله بعد تحقق الإدارة من الدفع.',
        data: { subscription },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}
