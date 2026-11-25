-- Enforce the session invariant at the database level: the sliding expiry can
-- never exceed the absolute deadline.
--
-- The approved 30-day backfill in 20261123120000_auth_session_absolute_expiry
-- derived absolute_expires_at from created_at. Any pre-existing row whose
-- sliding expiry extends beyond that deadline is clamped before the CHECK is
-- added so the migration is safe on a populated database.

UPDATE "sessions"
SET "expires_at" = "absolute_expires_at"
WHERE "expires_at" > "absolute_expires_at";

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_expiry_within_absolute_chk"
CHECK ("expires_at" <= "absolute_expires_at");
