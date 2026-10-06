-- Remove the payment feature entirely.
--
-- The platform is now free at the point of use: any signed-in student opens any
-- published course. Nothing reads access any more, so these tables are not
-- orphaned data -- they are the whole mechanism, gone.
--
-- DROP TABLE is used rather than a rename, per the decision to delete the data
-- rather than leave dead columns behind.

-- Payments first: it references subscriptions by foreign key.
DROP TABLE IF EXISTS "payments";

DROP TABLE IF EXISTS "subscriptions";

-- The per-subject price matrix. Nothing else references it.
DROP TABLE IF EXISTS "subject_access";

-- `Course.type` (FREE/PAID) and `Course.price` were only ever read by the access
-- gate and the pricing editor. Both are gone from the schema.
ALTER TABLE "courses" DROP COLUMN IF EXISTS "type";
ALTER TABLE "courses" DROP COLUMN IF EXISTS "price";

-- Enums that existed only for the above.
DROP TYPE IF EXISTS "SubscriptionStatus";
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "PaymentMethod";
DROP TYPE IF EXISTS "AccessType";
DROP TYPE IF EXISTS "CourseType";