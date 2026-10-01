import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { ACCESS_LABELS } from '@/lib/subscriptions/access';

const actionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

/**
 * Approve or reject a pending subscription.
 *
 * Approval is the only path to ACTIVE, and it is deliberately an explicit admin
 * action rather than something the payment record does on its own. The money
 * arriving and the subscription being granted are separate facts: a BaridiMob
 * transfer can be reversed, so "payment marked COMPLETED" must not silently
 * unlock content. The admin looks at the transfer reference, confirms it, and
 * only then approves.
 *
 * Rejecting also marks the payment FAILED, so the student's payment history
 * shows the outcome rather than leaving a PENDING row that reads as "maybe".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 },
      );
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'طلب غير صالح' },
        { status: 400 },
      );
    }

    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 },
      );
    }

    const { action, note } = parsed.data;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (!subscription) {
      return NextResponse.json(
        { success: false, message: 'الاشتراك غير موجود' },
        { status: 404 },
      );
    }

    if (subscription.status !== 'PENDING') {
      return NextResponse.json(
        {
          success: false,
          message: 'لا يمكن تعديل اشتراك ليس قيد المراجعة',
          data: { subscription },
        },
        { status: 409 },
      );
    }

    const newStatus = action === 'APPROVE' ? 'ACTIVE' : 'REJECTED';

    const [updated] = await prisma.$transaction([
      prisma.subscription.update({
        where: { id },
        data: { status: newStatus },
        include: {
          payments: true,
          subject: { select: { id: true, name: true, nameAr: true } },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              user: { select: { email: true } },
            },
          },
        },
      }),
      // Keep the payment row in step with the decision. An approved subscription
      // with a PENDING payment reads as unpaid in the payments report.
      prisma.payment.updateMany({
        where: { subscriptionId: id },
        data: { status: action === 'APPROVE' ? 'COMPLETED' : 'FAILED' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message:
        action === 'APPROVE'
          ? `تم تفعيل اشتراك ${ACCESS_LABELS[subscription.accessType]} للمادة`
          : 'تم رفض طلب الاشتراك',
      data: {
        subscription: {
          id: updated.id,
          status: updated.status,
          accessType: updated.accessType,
          accessLabel: ACCESS_LABELS[updated.accessType],
          startDate: updated.startDate,
          endDate: updated.endDate,
          subject: updated.subject,
          student: updated.student,
          payments: updated.payments.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            method: p.method,
            status: p.status,
            transactionId: p.transactionId,
            createdAt: p.createdAt,
          })),
        },
        note: note || null,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}
