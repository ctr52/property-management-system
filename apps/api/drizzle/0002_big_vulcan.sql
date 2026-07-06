CREATE TABLE "commission_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"source" text NOT NULL,
	"percent_bips" integer DEFAULT 0 NOT NULL,
	"fixed_minor" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
