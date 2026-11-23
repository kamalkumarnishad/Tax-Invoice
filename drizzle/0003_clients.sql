CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"company" varchar(255),
	"country" varchar(2),
	"currency" varchar(3),
	"billing_address" text,
	"tax_id" varchar(100),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_id_user" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_clients_user_name" ON "clients" USING btree ("user_id","name");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO taxpilot_app;
--> statement-breakpoint
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY clients_owner ON clients FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
