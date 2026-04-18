-- Generic ERP: per-company business type + JSON overrides, nullable legacy identifiers for non-vehicle inventory

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) NOT NULL DEFAULT 'vehicle_dealer',
  ADD COLUMN IF NOT EXISTS business_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE vehicles
  ALTER COLUMN chassis_number DROP NOT NULL,
  ALTER COLUMN engine_number DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_business_type ON companies(business_type) WHERE is_deleted = FALSE;
