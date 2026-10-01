import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get('subscriptionId');

    if (session.role === 'STUDENT') {
      const payments = await prisma.payment.findMany({
        where: {
          subscription: { studentId: session.student?.id },
          ...(subscriptionId && { subscriptionId }),
        },
        include: {
          subscription: {
            include: { subject: { select: { nameAr: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        success: true,
        data: { payments },
      });
    }

    if (session.role === 'ADMIN') {
      const payments = await prisma.payment.findMany({
            include: {
              subscription: {
                include: {
                  subject: { select: { nameAr: true, name: true } },
                  student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        success: true,
        data: { payments },
      });
    }

    return NextResponse.json(
      { success: false, message: 'غير مصرح' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = z
      .object({
        paymentId: z.string().min(1, 'معرّف الدفعة مطلوب'),
        status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']),
      })
      .safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      );
    }

    const { paymentId, status } = parsed.data;

    const existing = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'الدفعة غير موجودة' },
        { status: 404 }
      );
    }

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status },
      include: {
        subscription: true,
      },
    });

    if (status === 'COMPLETED') {
      await prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: { status: 'ACTIVE' },
      });
    }

    return NextResponse.json({
      success: true,
      data: { payment },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
