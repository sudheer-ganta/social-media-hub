-- Social Content Hub — initial schema
-- posts table with per-user Row Level Security (Supabase Auth).

-- CreateTable
CREATE TABLE "public"."posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT NOT NULL DEFAULT '',
    "platforms" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publish_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "publish_time" TIME(6) NOT NULL DEFAULT '09:00:00'::time without time zone,
    "created_by" UUID NOT NULL DEFAULT auth.uid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_created_by_idx" ON "public"."posts"("created_by");
CREATE INDEX "posts_status_idx" ON "public"."posts"("status");
CREATE INDEX "posts_publish_date_idx" ON "public"."posts"("publish_date");
CREATE INDEX "posts_created_at_idx" ON "public"."posts"("created_at" DESC);

-- Constraints not expressible in the Prisma schema language ------------------

-- Valid status values
ALTER TABLE "public"."posts"
  ADD CONSTRAINT "posts_status_check"
  CHECK ("status" IN ('draft', 'scheduled', 'published'));

-- Ownership FK into Supabase's auth schema
ALTER TABLE "public"."posts"
  ADD CONSTRAINT "posts_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- Keep updated_at fresh on every update
CREATE OR REPLACE FUNCTION "public"."handle_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "posts_updated_at"
  BEFORE UPDATE ON "public"."posts"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

-- Row Level Security: each user only sees their own posts
ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own posts" ON "public"."posts"
  FOR SELECT USING ("created_by" = auth.uid());

CREATE POLICY "Users insert own posts" ON "public"."posts"
  FOR INSERT WITH CHECK ("created_by" = auth.uid());

CREATE POLICY "Users update own posts" ON "public"."posts"
  FOR UPDATE USING ("created_by" = auth.uid());

CREATE POLICY "Users delete own posts" ON "public"."posts"
  FOR DELETE USING ("created_by" = auth.uid());
