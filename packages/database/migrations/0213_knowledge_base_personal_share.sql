CREATE TABLE IF NOT EXISTS "knowledge_base_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"user_id" text,
	"created_by" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_base_access_grants_subject_shape" CHECK (("knowledge_base_access_grants"."subject_type" = 'user' AND "knowledge_base_access_grants"."user_id" IS NOT NULL) OR ("knowledge_base_access_grants"."subject_type" = 'all' AND "knowledge_base_access_grants"."user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_base_share_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_access_grants" ADD CONSTRAINT "knowledge_base_access_grants_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_access_grants" ADD CONSTRAINT "knowledge_base_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_access_grants" ADD CONSTRAINT "knowledge_base_access_grants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_share_invites" ADD CONSTRAINT "knowledge_base_share_invites_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_base_share_invites" ADD CONSTRAINT "knowledge_base_share_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_base_access_grants_kb_user_unique" ON "knowledge_base_access_grants" USING btree ("knowledge_base_id","user_id") WHERE "knowledge_base_access_grants"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_base_access_grants_kb_all_unique" ON "knowledge_base_access_grants" USING btree ("knowledge_base_id") WHERE "knowledge_base_access_grants"."subject_type" = 'all' AND "knowledge_base_access_grants"."user_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_base_access_grants_kb_id_idx" ON "knowledge_base_access_grants" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_base_access_grants_user_id_idx" ON "knowledge_base_access_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_base_access_grants_created_by_idx" ON "knowledge_base_access_grants" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_base_share_invites_token_unique" ON "knowledge_base_share_invites" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_base_share_invites_kb_unique" ON "knowledge_base_share_invites" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_base_share_invites_kb_id_idx" ON "knowledge_base_share_invites" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_base_share_invites_created_by_idx" ON "knowledge_base_share_invites" USING btree ("created_by");
