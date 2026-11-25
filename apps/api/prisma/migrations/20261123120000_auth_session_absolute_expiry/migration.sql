-- Absolute session lifetime (30 days). Sliding expiration remains stored in
-- expires_at and must never exceed absolute_expires_at.

ALTER TABLE "sessions" ADD COLUMN "absolute_expires_at" TIMESTAMPTZ(3);

UPDATE "sessions"
SET "absolute_expires_at" = "created_at" + INTERVAL '30 days'
WHERE "absolute_expires_at" IS NULL;

ALTER TABLE "sessions" ALTER COLUMN "absolute_expires_at" SET NOT NULL;
