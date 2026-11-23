-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('OWNER', 'ADMIN', 'EVENT_MANAGER', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "api_key_status" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('EXHIBITION', 'CONFERENCE', 'WORKSHOP', 'TRADE_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "registration_status" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "registration_source" AS ENUM ('MANUAL', 'IMPORT', 'INGESTION_API', 'PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('TICKET', 'BOOTH');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "check_in_status" AS ENUM ('VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "check_in_reason" AS ENUM ('OUTSIDE_WINDOW', 'DUPLICATE', 'REGISTRATION_CANCELLED', 'REGISTRATION_NOT_CONFIRMED', 'REGISTRATION_NOT_FOUND', 'PARTICIPANT_NOT_FOUND', 'EVENT_NOT_FOUND', 'EVENT_CANCELLED');

-- CreateEnum
CREATE TYPE "check_in_source" AS ENUM ('MANUAL', 'CSV', 'INGESTION_API');

-- CreateEnum
CREATE TYPE "booth_status" AS ENUM ('AVAILABLE', 'RESERVED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "import_type" AS ENUM ('PARTICIPANTS', 'REGISTRATIONS', 'CHECKINS', 'PAYMENTS');

-- CreateEnum
CREATE TYPE "import_format" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "duplicate_strategy" AS ENUM ('SKIP', 'UPDATE', 'ERROR');

-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('EVENT_PERFORMANCE', 'FINANCIAL', 'ATTENDANCE', 'EXHIBITORS', 'EVENT_COMPARISON');

-- CreateEnum
CREATE TYPE "export_format" AS ENUM ('PDF', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "export_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "audit_category" AS ENUM ('AUTH', 'USERS_ROLES', 'ORGANIZATION', 'SENSITIVE_DATA', 'FINANCIAL', 'INGESTION');

-- CreateEnum
CREATE TYPE "audit_result" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_session_id" UUID,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Paris',
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "export_retention_days" SMALLINT NOT NULL DEFAULT 30,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "role" NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "token_hash" TEXT NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['ingestion:write']::TEXT[],
    "status" "api_key_status" NOT NULL DEFAULT 'ACTIVE',
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "event_type" NOT NULL,
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "location" VARCHAR(255),
    "description" TEXT,
    "check_in_opens_offset_minutes" INTEGER NOT NULL DEFAULT -120,
    "check_in_closes_offset_minutes" INTEGER NOT NULL DEFAULT 120,
    "manager_membership_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(30),
    "country" VARCHAR(2),
    "region" VARCHAR(100),
    "city" VARCHAR(100),
    "birth_year" SMALLINT,
    "gender" "gender",
    "anonymized_at" TIMESTAMPTZ(3),
    "erased_at" TIMESTAMPTZ(3),
    "merged_into_participant_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "status" "registration_status" NOT NULL DEFAULT 'PENDING',
    "source" "registration_source" NOT NULL,
    "source_detail" VARCHAR(100),
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "registration_id" UUID,
    "booth_reservation_id" UUID,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "refunded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(255),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID,
    "participant_id" UUID,
    "registration_id" UUID,
    "status" "check_in_status" NOT NULL,
    "reason" "check_in_reason",
    "source" "check_in_source" NOT NULL,
    "checked_in_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibitors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contact_name" VARCHAR(150),
    "email" CITEXT,
    "phone" VARCHAR(30),
    "website" VARCHAR(255),
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "exhibitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booths" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "zone" VARCHAR(100),
    "area_sqm" DECIMAL(8,2),
    "status" "booth_status" NOT NULL DEFAULT 'AVAILABLE',
    "price_amount" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "booths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booth_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "booth_id" UUID NOT NULL,
    "exhibitor_id" UUID NOT NULL,
    "status" "reservation_status" NOT NULL DEFAULT 'ACTIVE',
    "price_amount" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "reserved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booth_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID,
    "type" "import_type" NOT NULL,
    "format" "import_format" NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" CHAR(64) NOT NULL,
    "duplicate_strategy" "duplicate_strategy" NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "preview_metadata" JSONB,
    "error_report_key" TEXT,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "error_code" VARCHAR(50),
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "report_type" "report_type" NOT NULL,
    "format" "export_format" NOT NULL,
    "status" "export_status" NOT NULL DEFAULT 'PENDING',
    "parameters" JSONB NOT NULL,
    "pseudonymized" BOOLEAN NOT NULL DEFAULT false,
    "storage_key" TEXT,
    "file_size_bytes" BIGINT,
    "expires_at" TIMESTAMPTZ(3),
    "generated_at" TIMESTAMPTZ(3),
    "downloaded_at" TIMESTAMPTZ(3),
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "category" "audit_category" NOT NULL,
    "actor_user_id" UUID,
    "action_type" VARCHAR(80) NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" TEXT,
    "result" "audit_result" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_uq" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_hash_uq" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_replaced_by_uq" ON "sessions"("replaced_by_session_id");

-- CreateIndex
CREATE INDEX "sessions_user_revoked_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_family_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE INDEX "sessions_expires_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_hash_uq" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_expires_idx" ON "password_reset_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_user_status_idx" ON "memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "memberships_org_role_idx" ON "memberships"("organization_id", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_org_id_uq" ON "memberships"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_uq" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_org_status_idx" ON "invitations"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_org_status_idx" ON "api_keys"("organization_id", "status");

-- CreateIndex
CREATE INDEX "events_org_status_start_idx" ON "events"("organization_id", "status", "start_at");

-- CreateIndex
CREATE INDEX "events_org_type_idx" ON "events"("organization_id", "type");

-- CreateIndex
CREATE INDEX "events_org_manager_idx" ON "events"("organization_id", "manager_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_org_id_uq" ON "events"("organization_id", "id");

-- CreateIndex
CREATE INDEX "tickets_org_event_idx" ON "tickets"("organization_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_org_id_uq" ON "tickets"("organization_id", "id");

-- CreateIndex
CREATE INDEX "participants_org_email_idx" ON "participants"("organization_id", "email");

-- CreateIndex
CREATE INDEX "participants_org_name_idx" ON "participants"("organization_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "participants_org_geo_idx" ON "participants"("organization_id", "country", "region", "city");

-- CreateIndex
CREATE UNIQUE INDEX "participants_org_id_uq" ON "participants"("organization_id", "id");

-- CreateIndex
CREATE INDEX "registrations_org_event_status_time_idx" ON "registrations"("organization_id", "event_id", "status", "registered_at");

-- CreateIndex
CREATE INDEX "registrations_org_participant_time_idx" ON "registrations"("organization_id", "participant_id", "registered_at");

-- CreateIndex
CREATE INDEX "registrations_org_ticket_idx" ON "registrations"("organization_id", "ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_org_id_uq" ON "registrations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "transactions_org_event_paid_idx" ON "transactions"("organization_id", "event_id", "paid_at");

-- CreateIndex
CREATE INDEX "transactions_org_type_status_paid_idx" ON "transactions"("organization_id", "type", "status", "paid_at");

-- CreateIndex
CREATE INDEX "transactions_org_created_idx" ON "transactions"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_org_id_uq" ON "transactions"("organization_id", "id");

-- CreateIndex
CREATE INDEX "refunds_org_time_idx" ON "refunds"("organization_id", "refunded_at");

-- CreateIndex
CREATE INDEX "refunds_org_transaction_time_idx" ON "refunds"("organization_id", "transaction_id", "refunded_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_org_id_uq" ON "refunds"("organization_id", "id");

-- CreateIndex
CREATE INDEX "checkins_org_event_time_idx" ON "check_ins"("organization_id", "event_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "checkins_org_participant_event_idx" ON "check_ins"("organization_id", "participant_id", "event_id");

-- CreateIndex
CREATE INDEX "checkins_org_reason_time_idx" ON "check_ins"("organization_id", "reason", "checked_in_at");

-- CreateIndex
CREATE INDEX "checkins_org_status_time_idx" ON "check_ins"("organization_id", "status", "checked_in_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkins_org_id_uq" ON "check_ins"("organization_id", "id");

-- CreateIndex
CREATE INDEX "exhibitors_org_name_idx" ON "exhibitors"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "exhibitors_org_id_uq" ON "exhibitors"("organization_id", "id");

-- CreateIndex
CREATE INDEX "booths_org_event_status_zone_idx" ON "booths"("organization_id", "event_id", "status", "zone");

-- CreateIndex
CREATE UNIQUE INDEX "booths_org_id_uq" ON "booths"("organization_id", "id");

-- CreateIndex
CREATE INDEX "booth_reservations_org_event_status_idx" ON "booth_reservations"("organization_id", "event_id", "status");

-- CreateIndex
CREATE INDEX "booth_reservations_org_exhibitor_status_idx" ON "booth_reservations"("organization_id", "exhibitor_id", "status");

-- CreateIndex
CREATE INDEX "booth_reservations_org_booth_status_idx" ON "booth_reservations"("organization_id", "booth_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "booth_reservations_org_id_uq" ON "booth_reservations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "imports_org_status_created_idx" ON "imports"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "imports_org_event_idx" ON "imports"("organization_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "imports_org_idempotency_uq" ON "imports"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "exports_org_status_created_idx" ON "exports"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "exports_org_user_created_idx" ON "exports"("organization_id", "requested_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "exports_status_expires_idx" ON "exports"("status", "expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_category_created_idx" ON "audit_logs"("organization_id", "category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_actor_created_idx" ON "audit_logs"("organization_id", "actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_resource_created_idx" ON "audit_logs"("organization_id", "resource_type", "resource_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_fk" FOREIGN KEY ("replaced_by_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_manager_fk" FOREIGN KEY ("manager_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_merge_fk" FOREIGN KEY ("merged_into_participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_participant_fk" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_ticket_fk" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_registration_fk" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reservation_fk" FOREIGN KEY ("booth_reservation_id") REFERENCES "booth_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_transaction_fk" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "checkins_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "checkins_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "checkins_participant_fk" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "checkins_registration_fk" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "checkins_user_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibitors" ADD CONSTRAINT "exhibitors_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booths" ADD CONSTRAINT "booths_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booths" ADD CONSTRAINT "booths_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booth_reservations" ADD CONSTRAINT "booth_reservations_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booth_reservations" ADD CONSTRAINT "booth_reservations_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booth_reservations" ADD CONSTRAINT "booth_reservations_booth_fk" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booth_reservations" ADD CONSTRAINT "booth_reservations_exhibitor_fk" FOREIGN KEY ("exhibitor_id") REFERENCES "exhibitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booth_reservations" ADD CONSTRAINT "booth_reservations_user_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_user_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
