CREATE TABLE "tax_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tax_year_start" date NOT NULL,
	"rule_id" varchar(50) NOT NULL,
	"rule_version" integer NOT NULL,
	"input" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tax_calculations_user" ON "tax_calculations" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- No UPDATE: a saved calculation is never changed.
GRANT SELECT, INSERT, DELETE ON tax_calculations TO taxpilot_app;
--> statement-breakpoint
ALTER TABLE tax_calculations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tax_calculations_owner ON tax_calculations FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
