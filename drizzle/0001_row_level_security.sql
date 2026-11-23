-- The app switches to this role inside every user-scoped transaction (see
-- withUser in src/lib/db.ts). Table owners bypass row level security, and
-- Neon's default role does too, so policies only protect anything when queries
-- run as a role that is subject to them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taxpilot_app') THEN
    CREATE ROLE taxpilot_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT taxpilot_app TO %I', current_user);
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO taxpilot_app;
--> statement-breakpoint
CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT SELECT ON currencies, countries, tax_jurisdictions TO taxpilot_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings, tax_profiles TO taxpilot_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO taxpilot_app;
--> statement-breakpoint
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_settings_owner ON user_settings FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
--> statement-breakpoint
ALTER TABLE tax_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tax_profiles_owner ON tax_profiles FOR ALL TO taxpilot_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_logs_read_own ON audit_logs FOR SELECT TO taxpilot_app
  USING (user_id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY audit_logs_insert_own ON audit_logs FOR INSERT TO taxpilot_app
  WITH CHECK (user_id = app_current_user_id());
