CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "EntryStatus" AS ENUM ('processing', 'ready', 'error');
CREATE TYPE "DriveWriteStatus" AS ENUM ('ok', 'pending', 'failed');

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID,
    "data" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "google_token_sets" (
    "user_id" UUID NOT NULL,
    "access_ciphertext" TEXT NOT NULL,
    "access_iv" TEXT NOT NULL,
    "access_auth_tag" TEXT NOT NULL,
    "refresh_ciphertext" TEXT,
    "refresh_iv" TEXT,
    "refresh_auth_tag" TEXT,
    "key_version" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "google_token_sets_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "timeline_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL,
    "drive_write_status" "DriveWriteStatus" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "tags" TEXT[] NOT NULL,
    "drive_file_id" TEXT,
    "summary_markdown" TEXT,
    "key_points" TEXT[] NOT NULL,
    "metadata_refs" TEXT[] NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timeline_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entry_source_refs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "subject" TEXT,
    "from" TEXT,
    "date" TEXT,
    "name" TEXT,
    "mime_type" TEXT,
    "created_time" TEXT,
    "modified_time" TEXT,
    "size" TEXT,
    "internal_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entry_source_refs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "derived_artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "derived_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "max_tokens" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "user_selectable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "index_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "drive_file_id" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "index_packs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "google_token_sets"
ADD CONSTRAINT "google_token_sets_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timeline_entries"
ADD CONSTRAINT "timeline_entries_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entry_source_refs"
ADD CONSTRAINT "entry_source_refs_entry_id_fkey"
FOREIGN KEY ("entry_id") REFERENCES "timeline_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "derived_artifacts"
ADD CONSTRAINT "derived_artifacts_entry_id_fkey"
FOREIGN KEY ("entry_id") REFERENCES "timeline_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "index_packs"
ADD CONSTRAINT "index_packs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
