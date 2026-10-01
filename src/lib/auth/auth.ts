import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';
import { generateAccessToken, generateRefreshToken, setAuthCookies } from './jwt';

const SALT_ROUNDS = 12;

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function issueSession(user: { id: string; email: string; role: 'STUDENT' | 'TEACHER' | 'ADMIN' }) {
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  await prisma.$transaction([
    prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    }),
    prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    }),
  ]);

  await setAuthCookies(accessToken, refreshToken);

  return { accessToken, refreshToken };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function registerUser(data: {
  email: string;
  password: string;
  role: 'STUDENT' | 'TEACHER';
  firstName: string;
  lastName: string;
  phone?: string;
  level?: string;
  class?: string;
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new Error('البريد الإلكتروني مستخدم بالفعل');
  }

  const hashedPassword = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      role: data.role,
      ...(data.role === 'STUDENT'
        ? {
            student: {
              create: {
                firstName: data.firstName,
                lastName: data.lastName,
                phone: data.phone,
                level: data.level,
                class: data.class,
              },
            },
          }
        : {
            teacher: {
              create: {
                firstName: data.firstName,
                lastName: data.lastName,
                subjects: [],
                levels: [],
              },
            },
          }),
    },
    include: {
      student: true,
      teacher: true,
    },
  });

  await issueSession(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      student: user.student,
      teacher: user.teacher,
    },
  };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      student: true,
      teacher: true,
    },
  });

  if (!user) {
    throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }

  if (user.status !== 'ACTIVE') {
    throw new Error('الحساب غير نشط. تواصل مع الإدارة');
  }

  const isValid = await verifyPassword(password, user.password);

  if (!isValid) {
    throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await issueSession(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      student: user.student,
      teacher: user.teacher,
    },
  };
}

export async function logoutUser(userId: string, refreshToken?: string) {
  if (refreshToken) {
    // revoke only this device session, keep the user's other devices signed in
    await prisma.refreshToken.deleteMany({ where: { userId, token: refreshToken } });
    return;
  }

  await prisma.refreshToken.deleteMany({
    where: { userId },
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('المستخدم غير موجود');
  }

  const isValid = await verifyPassword(currentPassword, user.password);

  if (!isValid) {
    throw new Error('كلمة المرور الحالية غير صحيحة');
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  await revokeAllSessions(userId);
}
