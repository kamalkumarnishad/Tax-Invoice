CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"target_currency" varchar(3) NOT NULL,
	"rate" numeric(19, 8) NOT NULL,
	"rate_date" date NOT NULL,
	"source" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_pair_date_source" UNIQUE("base_currency","target_currency","rate_date","source"),
	CONSTRAINT "exchange_rates_positive" CHECK ("exchange_rates"."rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_target_currency_currencies_code_fk" FOREIGN KEY ("target_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Shared by everyone: users may read rates but not change them.
GRANT SELECT ON exchange_rates TO taxpilot_app;
