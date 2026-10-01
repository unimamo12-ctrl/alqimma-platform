'use client';

import { useRequireRole } from '@/lib/hooks/use-api';

/**
 * Container only.
 *
 * This used to render its own header and admin nav. Those links now live in the
 * dashboard layout's role bar, so keeping them here produced two stacked
 * navigation bars. The guard and spinner exports are unchanged because every
 * admin page imports them.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useAdminGuard() {
  return useRequireRole(['ADMIN'] as const);
}

export function Loading() {
  return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
    </div>
  );
}