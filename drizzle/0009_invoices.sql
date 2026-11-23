CREATE TABLE "business_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_name" varchar(255) NOT NULL,
	"address" text NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"payment_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(19, 4) NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"invoice_number" varchar(16) NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" varchar(3) NOT NULL,
	"tax_mode" varchar(20) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"sac_code" varchar(8),
	"place_of_supply" varchar(100),
	"subtotal" numeric(19, 4) NOT NULL,
	"discount_amount" numeric(19, 4) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(19, 4) DEFAULT '0' NOT NULL,
	"total" numeric(19, 4) NOT NULL,
	"notes" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"seller" jsonb,
	"buyer" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_user_number" UNIQUE("user_id","invoice_number"),
	CONSTRAINT "invoices_id_user" UNIQUE("id","user_id"),
	CONSTRAINT "invoices_amounts" CHECK ("invoices"."total" > 0 and "invoices"."discount_amount" >= 0 and "invoices"."tax_amount" >= 0),
	CONSTRAINT "invoices_issued_parties" CHECK ("invoices"."status" = 'draft' or ("invoices"."seller" is not null and "invoices"."buyer" is not null))
);
--> statement-breakpoint
ALTER TABLE "income_records" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "income_records" ADD COLUMN "invoice_amount" numeric(19, 4);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_user_id_invoices_id_user_id_fk" FOREIGN KEY ("invoice_id","user_id") REFERENCES "public"."invoices"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_user_id_clients_id_user_id_fk" FOREIGN KEY ("client_id","user_id") REFERENCES "public"."clients"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_items_invoice" ON "invoice_items" USING btree ("invoice_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_invoices_user_date" ON "invoices" USING btree ("user_id","invoice_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_invoices_client" ON "invoices" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "income_records" ADD CONSTRAINT "income_records_invoice_id_user_id_invoices_id_user_id_fk" FOREIGN KEY ("invoice_id","user_id") REFERENCES "public"."invoices"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_income_invoice" ON "income_records" USING btree ("invoice_id");--> statement-breakpoint
ALTER TABLE "income_records" ADD CONSTRAINT "income_invoice_pair" CHECK (("income_records"."invoice_id" is null) = ("income_records"."invoice_amount" is null) and ("income_records"."invoice_amount" is null or "income_records"."invoice_amount" > 0));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON business_profiles, invoices, invoice_items TO taxpilot_app;
--> statement-breakpoint
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY business_profiles_owner ON business_profiles FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
--> statement-breakpoint
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoices_owner ON invoices FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
--> statement-breakpoint
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invoice_items_owner ON invoice_items FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
