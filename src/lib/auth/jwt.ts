import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma/client';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '@/lib/auth/token';
import type { TokenPayload } from '@/lib/auth/token';

export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
export type { TokenPayload };

const secure = process.env.NODE_ENV === 'production';

const accessCookieOptions = {
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  maxAge: 15 * 60,
  path: '/',
};

const refreshCookieOptions = {
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60,
  path: '/',
};

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies();

  cookieStore.set('access_token', accessToken, accessCookieOptions);
  cookieStore.set('refresh_token', refreshToken, refreshCookieOptions);
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete('access_token');
  cookieStore.delete('refresh_token');
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) return null;

  const payload = verifyAccessToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          phone: true,
          level: true,
          class: true,
        },
      },
      teacher: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          subjects: true,
          levels: true,
          isOnline: true,
        },
      },
    },
  });

  if (!user || user.status !== 'ACTIVE') return null;

  return user;
}

export async function refreshAccessToken() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('refresh_token')?.value;

  if (!refreshToken) return null;

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) return null;

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!storedToken || storedToken.expiresAt < new Date()) return null;

  if (storedToken.user.status !== 'ACTIVE') return null;

  const newAccessToken = generateAccessToken({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  });

  const newRefreshToken = generateRefreshToken({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  });

  // rotate: the used token is destroyed, so a stolen copy cannot be replayed
  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { id: storedToken.id } }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  cookieStore.set('access_token', newAccessToken, accessCookieOptions);
  cookieStore.set('refresh_token', newRefreshToken, refreshCookieOptions);

  return newAccessToken;
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.deleteMany({ where: { token } });
}
