CREATE TABLE "rate_refreshes" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_refreshes_single" CHECK ("rate_refreshes"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "reference_rates" (
	"currency" varchar(3) NOT NULL,
	"rate_date" date NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"rate" numeric(19, 8) NOT NULL,
	"source" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_rates_currency_rate_date_pk" PRIMARY KEY("currency","rate_date"),
	CONSTRAINT "reference_rates_positive" CHECK ("reference_rates"."rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "reference_rates" ADD CONSTRAINT "reference_rates_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_rates" ADD CONSTRAINT "reference_rates_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Shared by all users: the app may read rates, and only system jobs write them.
GRANT SELECT ON reference_rates TO taxpilot_app;
