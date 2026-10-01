import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: session.id, isRead: false },
    });

    return NextResponse.json({
      success: true,
      data: { notifications, unreadCount },
    });
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

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'إرسال الإشعارات متاح للإدارة فقط' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, title, message, type, link } = body;

    if (!title || !message || !type) {
      return NextResponse.json(
        { success: false, message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' },
        { status: 400 }
      );
    }

    if (userId) {
      const notification = await prisma.notification.create({
        data: { userId, title, message, type, link },
      });

      return NextResponse.json({ success: true, data: { notification } });
    }

    const recipients = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, message: 'لا يوجد مستخدمون لإرسال إليهم' },
        { status: 400 }
      );
    }

    await prisma.notification.createMany({
      data: recipients.map((user) => ({
        userId: user.id,
        title,
        message,
        type,
        link: link ?? null,
      })),
    });

    return NextResponse.json({
      success: true,
      message: `تم إرسال الإشعار إلى ${recipients.length} مستخدم`,
      data: { count: recipients.length },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { notificationId, isRead } = body;

    if (notificationId) {
      const owned = await prisma.notification.findFirst({
        where: { id: notificationId, userId: session.id },
        select: { id: true },
      });

      if (!owned) {
        return NextResponse.json(
          { success: false, message: 'الإشعار غير موجود' },
          { status: 404 }
        );
      }

      const notification = await prisma.notification.update({
        where: { id: owned.id },
        data: { isRead: isRead !== false },
      });

      return NextResponse.json({
        success: true,
        data: { notification },
      });
    }

    await prisma.notification.updateMany({
      where: { userId: session.id, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({
      success: true,
      message: 'تم تحديث جميع الإشعارات',
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
