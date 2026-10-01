import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { ACCESS_LABELS } from '@/lib/subscriptions/access';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const accessType = searchParams.get('accessType');

    const subscriptions = await prisma.subscription.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(accessType ? { accessType: accessType as never } : {}),
      },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        subscriptions: subscriptions.map((sub) => ({
          id: sub.id,
          status: sub.status,
          accessType: sub.accessType,
          accessLabel: ACCESS_LABELS[sub.accessType],
          startDate: sub.startDate,
          endDate: sub.endDate,
          subject: sub.subject,
          student: sub.student,
payments: sub.payments.map((p) => ({
              id: p.id,
              amount: Number(p.amount),
              method: p.method,
              status: p.status,
              transactionId: p.transactionId,
              // the receipt has to travel with the request or the panel shows a
              // reference number and nothing to verify it against
              proofUrl: p.proofUrl,
              createdAt: p.createdAt,
            })),
        })),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}
