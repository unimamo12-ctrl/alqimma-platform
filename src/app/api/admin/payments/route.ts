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

    const payments = await prisma.payment.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
      },
      include: {
        subscription: {
          include: {
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
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        payments: payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          method: p.method,
          status: p.status,
transactionId: p.transactionId,
            proofUrl: p.proofUrl,
            createdAt: p.createdAt,
          subscription: p.subscription
            ? {
                id: p.subscription.id,
                status: p.subscription.status,
                accessType: p.subscription.accessType,
                accessLabel: ACCESS_LABELS[p.subscription.accessType],
                subject: p.subscription.subject,
                student: p.subscription.student,
              }
            : null,
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
