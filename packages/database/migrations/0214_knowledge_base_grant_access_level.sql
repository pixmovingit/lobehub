ALTER TABLE "knowledge_base_access_grants" ADD COLUMN IF NOT EXISTS "access_level" text DEFAULT 'view' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_access_grants" ADD CONSTRAINT "knowledge_base_access_grants_access_level_check" CHECK ("knowledge_base_access_grants"."access_level" IN ('view', 'edit', 'delete'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
