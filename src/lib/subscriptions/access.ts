import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import type { AccessType, CourseType, SubscriptionStatus } from '@prisma/client';

export type { AccessType };

export const ACCESS_TYPES: AccessType[] = ['LIVE', 'VIDEO', 'EXERCISE'];

export const ACCESS_LABELS: Record<AccessType, string> = {
  LIVE: 'البث المباشر',
  VIDEO: 'الفيديوهات المسجلة',
  EXERCISE: 'التمارين',
};

export const ACCESS_DESCRIPTIONS: Record<AccessType, string> = {
  LIVE: 'دخول غرف البث المباشر وحضور الحصص مع الأستاذ',
  VIDEO: 'مشاهدة الدروس المسجلة في أي وقت',
  EXERCISE: 'حل التمارين التفاعلية والحصول على التصحيح',
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING: 'بانتظار تحقق الإدارة',
  ACTIVE: 'نشط',
  REJECTED: 'مرفوض',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
};

/**
 * The one query every content gate funnels through.
 *
 * Deliberately a single query rather than three near-duplicates: the three
 * access types differ only in the `accessType` value, and a student either has
 * a live row or does not. Splitting this into per-type helpers is how a gate
 * ends up checking LIVE when it meant to check VIDEO.
 *
 * Only ACTIVE counts, and only inside the date window. A PENDING row is a
 * request, not a key — that distinction is the whole admin-approval workflow,
 * so it is enforced here rather than at each call site where it can be forgotten.
 */
export async function findActiveAccess(
  studentId: string,
  subjectId: string,
  accessType: AccessType,
) {
  const now = new Date();

  return prisma.subscription.findFirst({
    where: {
      studentId,
      subjectId,
      accessType,
      status: 'ACTIVE',
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { id: true, endDate: true },
  });
}

export async function hasAccess(
  studentId: string,
  subjectId: string,
  accessType: AccessType,
): Promise<boolean> {
  return (await findActiveAccess(studentId, subjectId, accessType)) !== null;
}

/**
 * Guard form for API routes: returns a 403 response instead of a boolean, so a
 * route can `if (!ok) return ok.response` and be done.
 *
 * The message names the access type in Arabic because it is shown to the
 * student, and a generic "not allowed" sends them to support instead of to the
 * subscribe button.
 */
export async function requireAccess(
  studentId: string,
  subjectId: string,
  accessType: AccessType,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (await hasAccess(studentId, subjectId, accessType)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        success: false,
        message: `تحتاج إلى اشتراك في ${ACCESS_LABELS[accessType]} لهذه المادة`,
        data: { requiredAccess: accessType },
      },
      { status: 403 },
    ),
  };
}

/**
 * Every active access a student holds, keyed by subject.
 *
 * Used by the student dashboard and the subject browser, which have to show
 * "subscribed" versus "subscribe now" per subject. One query for all of it
 * rather than one per subject, because the subject list is five rows today and
 * a per-subject round trip is the kind of thing that becomes fifty.
 */
export async function activeAccessBySubject(studentId: string) {
  const rows = await prisma.subscription.findMany({
    where: {
      studentId,
      status: 'ACTIVE',
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    },
    select: { subjectId: true, accessType: true, endDate: true },
  });

  const map = new Map<string, { accessTypes: AccessType[]; endDate: Date }>();
  for (const row of rows) {
    const entry = map.get(row.subjectId);
    if (entry) {
      entry.accessTypes.push(row.accessType);
      if (row.endDate > entry.endDate) entry.endDate = row.endDate;
    } else {
      map.set(row.subjectId, {
        accessTypes: [row.accessType],
        endDate: row.endDate,
      });
    }
  }
  return map;
}

/**
 * The subject ids a student can reach for a given access type.
 *
 * The list endpoints need this to filter what they return. Returning only
 * subscribed subjects is better than returning everything and letting the
 * detail endpoint 403: the student sees an empty page rather than a wall of
 * locked cards, and cannot enumerate content they have no business seeing.
 */
export async function accessibleSubjectIds(studentId: string, accessType: AccessType) {
  const rows = await prisma.subscription.findMany({
    where: {
      studentId,
      accessType,
      status: 'ACTIVE',
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    },
    select: { subjectId: true },
  });

  return rows.map((row) => row.subjectId);
}

/**
 * The course filter a student is allowed to list content from.
 *
 * A course is either FREE or PAID, and that is the teacher's decision when they
 * add it. FREE means anyone signed in may open it — no subscription, no payment,
 * no admin approval. PAID means it needs the matching subscription cell for its
 * subject. Both live in one `OR` so a list endpoint cannot accidentally leak
 * PAID subjects or hide FREE ones.
 *
 * The access type still matters *within* PAID: holding `MATH:LIVE` opens a PAID
 * course's live session and nothing else of it.
 */
export async function courseAccessFilter(
  studentId: string | null,
  accessType: AccessType,
): Promise<Prisma.CourseWhereInput> {
  if (!studentId) return { type: 'FREE' };

  const allowed = await accessibleSubjectIds(studentId, accessType);

  return {
    OR: [
      { type: 'FREE' },
      ...(allowed.length > 0 ? [{ type: 'PAID' as const, subjectId: { in: allowed } }] : []),
    ],
  };
}

/**
 * Detail-route guard: a FREE course is open to any student, a PAID one still
 * needs the subscription. Returning the same 403 as before keeps the "subscribe"
 * message on the paid path.
 */
export async function requireCourseAccess(
  studentId: string | null,
  subjectId: string,
  accessType: AccessType,
  courseType: CourseType,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (courseType === 'FREE') return { ok: true };

  if (studentId && (await hasAccess(studentId, subjectId, accessType))) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        success: false,
        message: `تحتاج إلى اشتراك في ${ACCESS_LABELS[accessType]} لهذه المادة`,
        data: { requiredAccess: accessType },
      },
      { status: 403 },
    ),
  };
}

export function isAccessType(value: unknown): value is AccessType {
  return typeof value === 'string' && (ACCESS_TYPES as string[]).includes(value);
}
