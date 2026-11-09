CREATE TABLE IF NOT EXISTS "system_service_model_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"system_agent" jsonb,
	"default_agent" jsonb,
	"image" jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
