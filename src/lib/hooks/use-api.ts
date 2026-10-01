'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

/**
 * Mirrors the `getSession()` select in `src/lib/auth/jwt.ts`.
 *
 * The nested profiles are declared with their full field lists because pages
 * read them: the account screen shows phone/level/class for students and
 * bio/subjects/levels for teachers. Listing only the names made every one of
 * those reads a type error.
 */
export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    phone: string | null;
    level: string | null;
    class: string | null;
  } | null;
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    bio: string | null;
    subjects: string[];
    levels: string[];
    isOnline: boolean;
  } | null;
}

export function useRequireRole(roles: readonly UserRole[]) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const key = roles.join(',');

  useEffect(() => {
    let cancelled = false;
    const allowedRoles = key.split(',') as UserRole[];

    const run = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const json = (await res.json()) as ApiResponse<{ user: SessionUser }>;

        if (cancelled) return;

        if (res.ok && json.success && allowedRoles.includes(json.data?.user.role as UserRole)) {
          setAllowed(true);
        } else {
          router.replace('/login');
        }
      } catch {
        if (!cancelled) router.replace('/login');
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, key]);

  return allowed;
}

export function useCurrentUser() {
  return useApiData<{ user: SessionUser }>('/api/auth/me');
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export function useApiData<T>(url: string | null, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(url) && enabled);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url || !enabled) return;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(url);
        const json = (await res.json()) as ApiResponse<T>;

        if (cancelled) return;

        if (!res.ok || !json.success) {
          setError(json.message || 'تعذر تحميل البيانات');
        } else {
          setData(json.data ?? null);
          setError('');
        }
      } catch {
        if (!cancelled) setError('تعذر الاتصال بالخادم');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [url, enabled, nonce]);

  const reload = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return { data, error, loading, reload, setData };
}

export function useSubmit<TBody, TResult>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const submit = useCallback(
    async (body: TBody): Promise<TResult | null> => {
      setSubmitting(true);
      setError('');
      setOk(false);

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json = (await res.json()) as ApiResponse<TResult>;

        if (!res.ok || !json.success) {
          setError(json.message || 'تعذر إتمام العملية');
          return null;
        }

        setOk(true);
        return (json.data ?? undefined) as TResult;
      } catch {
        setError('تعذر الاتصال بالخادم');
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [url, method],
  );

  return { submit, submitting, error, ok, setError };
}
