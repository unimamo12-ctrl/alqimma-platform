-- Per-subject, per-access-type subscriptions replace the old bundle plans.
--
-- The old `payments.method` held free text (CASH, CCP, BARIDIMOB, BANK_TRANSFER)
-- and the old `subscriptions` pointed at a plan rather than a subject, so neither
-- table can be altered in place: the method values are not members of the new
-- PaymentMethod enum, and the subscription rows have no subject to attach to.
-- Both are rebuilt. Seed and test data only — no production history to preserve.

-- 1. New enums
CREATE TYPE "AccessType" AS ENUM ('LIVE', 'VIDEO', 'EXERCISE');
CREATE TYPE "PaymentMethod" AS ENUM ('BARIDI', 'MOB');

-- 2. Pricing catalog: one row per (subject, accessType)
CREATE TABLE "subject_access" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subject_access_subjectId_accessType_key" ON "subject_access"("subjectId", "accessType");
CREATE INDEX "subject_access_accessType_idx" ON "subject_access"("accessType");

-- 3. Rebuild subscriptions with subjectId + accessType instead of planId
CREATE TABLE "subscriptions_new" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_new_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_studentId_subjectId_accessType_key" ON "subscriptions_new"("studentId", "subjectId", "accessType");
CREATE INDEX "subscriptions_studentId_status_idx" ON "subscriptions_new"("studentId", "status");
CREATE INDEX "subscriptions_subjectId_idx" ON "subscriptions_new"("subjectId");

-- 4. Rebuild payments with the method enum
CREATE TABLE "payments_new" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_new_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payments_new_subscriptionId_idx" ON "payments_new"("subscriptionId");

-- 5. Drop the old tables
DROP TABLE "payments";
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_planId_fkey";
DROP TABLE "subscription_plans";
DROP TABLE "subscriptions";

-- 6. Swap in the new tables
ALTER TABLE "subscriptions_new" RENAME TO "subscriptions";
ALTER TABLE "payments_new" RENAME TO "payments";

-- 7. Foreign keys
ALTER TABLE "subject_access" ADD CONSTRAINT "subject_access_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
