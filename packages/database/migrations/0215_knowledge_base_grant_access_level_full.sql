ALTER TABLE "knowledge_base_access_grants" DROP CONSTRAINT IF EXISTS "knowledge_base_access_grants_access_level_check";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_access_grants" ADD CONSTRAINT "knowledge_base_access_grants_access_level_check" CHECK ("knowledge_base_access_grants"."access_level" IN ('view', 'edit', 'delete', 'full'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
