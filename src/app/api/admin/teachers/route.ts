import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getSession } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/auth';

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    const teachers = await prisma.teacher.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            courses: true,
            liveSessions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: { teachers },
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

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'غير مصرح' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email, password, firstName, lastName, bio, subjects, levels } = body;

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { success: false, message: 'جميع الحقول المطلوبة يجب أن تكون موجودة' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'البريد الإلكتروني مستخدم بالفعل' },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);

    const teacher = await prisma.teacher.create({
      data: {
        user: {
          create: {
            email,
            password: hashedPassword,
            role: 'TEACHER',
          },
        },
        firstName,
        lastName,
        bio,
        subjects: subjects || [],
        levels: levels || [],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: { teacher },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
