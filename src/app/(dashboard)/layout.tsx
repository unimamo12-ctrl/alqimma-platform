'use client';

import { useMemo } from 'react';
import DashboardLayout from './_components/dashboard-layout';
import type { IconName } from '@/components/icons';
import { useApiData, type SessionUser } from '@/lib/hooks/use-api';

/*
 * Icons are named from the shared set in `@/components/icons`, not emoji.
 * The previous emoji keys relied on a lookup table that silently fell back to
 * a generic glyph for anything it did not recognise, so a typo showed up as a
 * wrong-but-plausible icon rather than an error. Typing the field as IconName
 * makes that a compile-time failure instead.
 */
interface RoleItem {
  href: string;
  label: string;
  icon: IconName;
}

const STUDENT_ITEMS: RoleItem[] = [
  { href: '/student', label: 'لوحة التحكم', icon: 'home' },
  { href: '/student/subjects', label: 'المواد والاشتراكات', icon: 'book' },
  { href: '/student/live', label: 'البث المباشر', icon: 'broadcast' },
  { href: '/student/videos', label: 'الفيديوهات', icon: 'video' },
  { href: '/student/exercises', label: 'التمارين', icon: 'penLine' },
  { href: '/student/quizzes', label: 'الاختبارات', icon: 'layers' },
  { href: '/student/subscriptions', label: 'اشتراكاتي', icon: 'shield' },
  { href: '/student/notifications', label: 'الإشعارات', icon: 'sparkle' },
];

const TEACHER_ITEMS: RoleItem[] = [
  { href: '/teacher', label: 'لوحة التحكم', icon: 'home' },
  { href: '/teacher/videos', label: 'الفيديوهات', icon: 'video' },
  { href: '/teacher/files', label: 'الملفات', icon: 'layers' },
  { href: '/teacher/exercises', label: 'التمارين', icon: 'penLine' },
  { href: '/teacher/quizzes', label: 'الاختبارات', icon: 'layers' },
  { href: '/teacher/live', label: 'البث المباشر', icon: 'broadcast' },
  { href: '/teacher/attendance', label: 'الحضور', icon: 'check' },
  { href: '/teacher/students', label: 'الطلاب', icon: 'users' },
  { href: '/teacher/profile', label: 'الملف الشخصي', icon: 'user' },
  { href: '/teacher/settings', label: 'الإعدادات', icon: 'shield' },
];

const ADMIN_ITEMS: RoleItem[] = [
  { href: '/admin', label: 'لوحة التحكم', icon: 'home' },
  { href: '/admin/students', label: 'الطلاب', icon: 'users' },
  { href: '/admin/teachers', label: 'الأساتذة', icon: 'graduation' },
  { href: '/admin/content', label: 'المحتوى', icon: 'book' },
  { href: '/admin/subscriptions', label: 'الاشتراكات والدفع', icon: 'shield' },
  { href: '/admin/password', label: 'كلمة السر', icon: 'shield' },
];

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const me = useApiData<{ user: SessionUser }>('/api/auth/me');

  const role = me.data?.user.role ?? null;

  const sidebarItems = useMemo(() => {
    if (role === 'STUDENT') return STUDENT_ITEMS;
    if (role === 'TEACHER') return TEACHER_ITEMS;
    return ADMIN_ITEMS;
  }, [role]);

  const user = useMemo(() => {
    if (!me.data?.user) return null;
    const u = me.data.user;
    if (u.role === 'STUDENT') {
      return { firstName: u.student?.firstName || '', lastName: u.student?.lastName || '', role: 'STUDENT' as const };
    }
    if (u.role === 'TEACHER') {
      return { firstName: u.teacher?.firstName || '', lastName: u.teacher?.lastName || '', role: 'TEACHER' as const };
    }
    return { firstName: 'مدير', lastName: 'النظام', role: 'ADMIN' as const };
  }, [me.data]);

  if (me.loading || !role || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900/60">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const title = role === 'STUDENT' ? 'طالب' : role === 'TEACHER' ? 'أستاذ' : 'إدارة';

  return (
    <DashboardLayout title={title} sidebarItems={sidebarItems} user={user}>
      {children}
    </DashboardLayout>
  );
}