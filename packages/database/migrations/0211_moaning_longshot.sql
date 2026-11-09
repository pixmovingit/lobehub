CREATE TABLE "system_ai_models" (
	"id" varchar(150) NOT NULL,
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(200),
	"description" text,
	"organization" varchar(100),
	"enabled" boolean DEFAULT true NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"type" varchar(20) DEFAULT 'chat' NOT NULL,
	"sort" integer,
	"pricing" jsonb,
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"config" jsonb,
	"abilities" jsonb DEFAULT '{}'::jsonb,
	"context_window_tokens" integer,
	"released_at" varchar(10),
	"settings" jsonb DEFAULT '{}'::jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_ai_providers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" integer,
	"check_model" text,
	"fetch_on_client" boolean,
	"key_vaults" text,
	"settings" jsonb NOT NULL,
	"config" jsonb NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_ai_models" ADD CONSTRAINT "system_ai_models_provider_id_system_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."system_ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "system_ai_models_id_provider_id_unique" ON "system_ai_models" USING btree ("id","provider_id");--> statement-breakpoint
CREATE INDEX "system_ai_models_provider_id_idx" ON "system_ai_models" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "system_ai_providers_enabled_idx" ON "system_ai_providers" USING btree ("enabled");