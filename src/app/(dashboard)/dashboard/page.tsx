import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/jwt';
import { homeForRole } from '@/lib/auth/routes';

export default async function DashboardRedirect() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  redirect(homeForRole(session.role));
}
