'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
export interface Profile {
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  bio?: string | null;
  level?: string | null;
  className?: string | null;
  subjects?: string[];
  levels?: string[];
}

/**
 * Container only.
 *
 * The teacher nav links now live in the dashboard layout's role bar; keeping a
 * second header here produced two stacked navigation bars. `useProfileLoader`
 * is untouched because every teacher page depends on it.
 */
export function TeacherShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useProfileLoader() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || !data.success) {
          router.push('/login');
          return;
        }

        const user = data.data.user;
        setProfile({
          email: user.email,
          role: user.role,
          firstName: user.teacher?.firstName ?? user.student?.firstName ?? '',
          lastName: user.teacher?.lastName ?? user.student?.lastName ?? '',
          phone: user.student?.phone ?? null,
          level: user.student?.level ?? null,
          className: user.student?.class ?? null,
          bio: user.teacher?.bio ?? null,
          subjects: user.teacher?.subjects,
          levels: user.teacher?.levels,
        });
      } catch {
        if (!cancelled) router.push('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, nonce]);

  const load = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return { profile, loading, load };
}
