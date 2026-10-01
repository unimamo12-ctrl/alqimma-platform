import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/token';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  homeForRole,
  isApiPath,
  matchProtectedRoute,
} from '@/lib/auth/routes';

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/teachers',
]);

function clearAuth(response: NextResponse): NextResponse {
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isApiPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value;

  if (!token) {
    if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
    if (matchProtectedRoute(pathname)) {
      const login = new URL('/login', request.url);
      login.searchParams.set('next', pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
    if (matchProtectedRoute(pathname)) {
      return clearAuth(NextResponse.redirect(new URL('/login', request.url)));
    }
    return clearAuth(NextResponse.next());
  }

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === '/login' || pathname === '/register') {
      return NextResponse.redirect(new URL(homeForRole(payload.role), request.url));
    }
    return NextResponse.next();
  }

  const rule = matchProtectedRoute(pathname);

  if (rule && !rule.roles.includes(payload.role)) {
    return NextResponse.redirect(new URL(homeForRole(payload.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
