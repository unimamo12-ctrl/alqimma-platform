export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const ROLE_HOME: Record<Role, string> = {
  STUDENT: '/student',
  TEACHER: '/teacher',
  ADMIN: '/admin',
};

export function homeForRole(role: Role | string | null | undefined): string {
  if (role === 'ADMIN' || role === 'TEACHER' || role === 'STUDENT') {
    return ROLE_HOME[role];
  }
  return '/login';
}

/**
 * Protected route prefixes, matched on whole path segments so that
 * public paths like `/teachers` are not captured by `/teacher`.
 */
const PROTECTED: { prefix: string; roles: Role[] }[] = [
  { prefix: '/dashboard', roles: ['STUDENT', 'TEACHER', 'ADMIN'] },
  { prefix: '/student', roles: ['STUDENT', 'ADMIN'] },
  { prefix: '/teacher', roles: ['TEACHER', 'ADMIN'] },
  { prefix: '/admin', roles: ['ADMIN'] },
];

export function matchProtectedRoute(
  pathname: string,
): { prefix: string; roles: Role[] } | null {
  for (const rule of PROTECTED) {
    if (
      pathname === rule.prefix ||
      pathname.startsWith(`${rule.prefix}/`)
    ) {
      return rule;
    }
  }
  return null;
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}
