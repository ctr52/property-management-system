CREATE TABLE "subscriptions" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"payment_method_attached" boolean DEFAULT false NOT NULL,
	"billing_method_ref" text,
	"ever_paid" boolean DEFAULT false NOT NULL,
	"current_period_end" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trial_eligibility_ledger" (
	"phone_e164" text PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_ledger" (
	"card_fingerprint" text PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_setup_intents" (
	"payment_id" text PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"phone_e164" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
