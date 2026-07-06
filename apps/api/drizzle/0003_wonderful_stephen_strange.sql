CREATE TABLE "channel_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_thread_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "channel_threads_org_platform_thread" UNIQUE("org_id","platform","external_thread_id")
);
