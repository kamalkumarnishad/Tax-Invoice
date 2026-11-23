CREATE TABLE "income_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid,
	"description" text NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"exchange_rate" numeric(19, 8) NOT NULL,
	"converted_amount" numeric(19, 4) NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"payment_date" date NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"payment_gateway_fee" numeric(19, 4) DEFAULT '0' NOT NULL,
	"bank_charges" numeric(19, 4) DEFAULT '0' NOT NULL,
	"tds_deducted" numeric(19, 4) DEFAULT '0' NOT NULL,
	"net_received" numeric(19, 4) NOT NULL,
	"income_category" varchar(50) NOT NULL,
	"tax_year_start" date NOT NULL,
	"status" varchar(20) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "income_amount_positive" CHECK ("income_records"."amount" > 0 and "income_records"."exchange_rate" > 0),
	CONSTRAINT "income_deductions_not_negative" CHECK ("income_records"."payment_gateway_fee" >= 0 and "income_records"."bank_charges" >= 0 and "income_records"."tds_deducted" >= 0 and "income_records"."net_received" >= 0)
);
--> statement-breakpoint
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_client_id_user_id_clients_id_user_id_fk" FOREIGN KEY ("client_id","user_id") REFERENCES "public"."clients"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_income_user_date" ON "income_records" USING btree ("user_id","payment_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_income_user_taxyear" ON "income_records" USING btree ("user_id","tax_year_start");--> statement-breakpoint
CREATE INDEX "idx_income_client" ON "income_records" USING btree ("client_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON income_records TO taxpilot_app;
--> statement-breakpoint
ALTER TABLE income_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY income_records_owner ON income_records FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
