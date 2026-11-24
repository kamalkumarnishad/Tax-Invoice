CREATE TABLE "compliance_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"deadline_key" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_marks_user_key" UNIQUE("user_id","deadline_key")
);
--> statement-breakpoint
CREATE TABLE "compliance_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"due_date" date NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_key" varchar(100) NOT NULL,
	"due_date" date NOT NULL,
	"days_before" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_log_once" UNIQUE("user_id","item_key","due_date","days_before")
);
--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD COLUMN "gst_filing" varchar(20);--> statement-breakpoint
ALTER TABLE "compliance_marks" ADD CONSTRAINT "compliance_marks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_tasks" ADD CONSTRAINT "compliance_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_compliance_tasks_user_due" ON "compliance_tasks" USING btree ("user_id","due_date");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance_marks, compliance_tasks TO taxpilot_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON reminder_log TO taxpilot_app;
--> statement-breakpoint
ALTER TABLE compliance_marks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY compliance_marks_owner ON compliance_marks FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
--> statement-breakpoint
ALTER TABLE compliance_tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY compliance_tasks_owner ON compliance_tasks FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
--> statement-breakpoint
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reminder_log_owner ON reminder_log FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
