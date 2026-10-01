import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';

const PUBLIC_TEACHER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  bio: true,
  subjects: true,
  levels: true,
  avatar: true,
  isOnline: true,
  createdAt: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subject');
    const level = searchParams.get('level');
    const search = searchParams.get('search')?.trim();

    const where: Prisma.TeacherWhereInput = { user: { status: 'ACTIVE' } };

    if (subject) where.subjects = { has: subject };
    if (level) where.levels = { has: level };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const teachers = await prisma.teacher.findMany({
      where,
      select: {
        ...PUBLIC_TEACHER_SELECT,
        _count: {
          select: { courses: true, liveSessions: true },
        },
      },
      orderBy: [{ isOnline: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, data: { teachers } });
  } catch {
    return NextResponse.json(
      { success: false, message: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}
