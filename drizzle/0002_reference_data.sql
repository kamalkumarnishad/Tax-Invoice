INSERT INTO currencies (code, name, symbol, decimal_places) VALUES
  ('INR', 'Indian Rupee', '₹', 2),
  ('USD', 'US Dollar', '$', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'Pound Sterling', '£', 2),
  ('AED', 'UAE Dirham', 'AED', 2),
  ('CAD', 'Canadian Dollar', 'CA$', 2),
  ('AUD', 'Australian Dollar', 'A$', 2),
  ('SGD', 'Singapore Dollar', 'S$', 2),
  ('JPY', 'Japanese Yen', '¥', 0)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
-- Only India is supported. The others stay unsupported until a qualified
-- professional in each country has validated their rules.
INSERT INTO countries (code, name, currency_code, is_supported) VALUES
  ('IN', 'India', 'INR', true),
  ('US', 'United States', 'USD', false),
  ('GB', 'United Kingdom', 'GBP', false),
  ('AE', 'United Arab Emirates', 'AED', false),
  ('CA', 'Canada', 'CAD', false),
  ('AU', 'Australia', 'AUD', false)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO tax_jurisdictions (country_id, code, name, jurisdiction_type)
SELECT id, 'IN', 'India', 'country' FROM countries WHERE code = 'IN'
ON CONFLICT (country_id, code) DO NOTHING;
