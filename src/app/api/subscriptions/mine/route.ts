import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { activeAccessBySubject, ACCESS_LABELS, ACCESS_TYPES } from '@/lib/subscriptions/access';

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.role !== 'STUDENT' || !session.student) {
      return NextResponse.json(
        { success: false, message: 'يجب تسجيل الدخول كطالب' },
        { status: 401 },
      );
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { studentId: session.student.id },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
        subject: { select: { id: true, name: true, nameAr: true, icon: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const held = await activeAccessBySubject(session.student.id);

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
          payments: sub.payments.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            method: p.method,
            status: p.status,
            transactionId: p.transactionId,
            createdAt: p.createdAt,
          })),
        })),
        activeBySubject: [...held.entries()].map(([subjectId, value]) => ({
          subjectId,
          accessTypes: value.accessTypes,
          endDate: value.endDate,
        })),
        accessTypes: ACCESS_TYPES,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}
