import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  jti?: string;
}

function accessSecret(): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return JWT_SECRET;
}

function refreshSecret(): string {
  if (!JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is not configured');
  }
  return JWT_REFRESH_SECRET;
}

export function generateAccessToken(payload: Omit<TokenPayload, 'jti'>): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, accessSecret(), { expiresIn: '15m' });
}

export function generateRefreshToken(payload: Omit<TokenPayload, 'jti'>): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, refreshSecret(), { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, accessSecret()) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, refreshSecret()) as TokenPayload;
  } catch {
    return null;
  }
}
