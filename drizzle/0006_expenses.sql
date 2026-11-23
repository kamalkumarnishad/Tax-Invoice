CREATE TABLE "expense_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"exchange_rate" numeric(19, 8) NOT NULL,
	"converted_amount" numeric(19, 4) NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"category" varchar(50) NOT NULL,
	"expense_date" date NOT NULL,
	"vendor" varchar(255),
	"payment_method" varchar(50) NOT NULL,
	"is_deductible" boolean DEFAULT true NOT NULL,
	"tax_year_start" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("expense_records"."amount" > 0 and "expense_records"."exchange_rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_expenses_user_date" ON "expense_records" USING btree ("user_id","expense_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_expenses_user_category" ON "expense_records" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "idx_expenses_user_taxyear" ON "expense_records" USING btree ("user_id","tax_year_start");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_records TO taxpilot_app;
--> statement-breakpoint
ALTER TABLE expense_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY expense_records_owner ON expense_records FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
