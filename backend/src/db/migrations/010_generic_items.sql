ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS item_name VARCHAR(500),
  ADD COLUMN IF NOT EXISTS sku VARCHAR(200),
  ADD COLUMN IF NOT EXISTS category VARCHAR(200),
  ADD COLUMN IF NOT EXISTS brand VARCHAR(200),
  ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(50) DEFAULT 'Pcs',
  ADD COLUMN IF NOT EXISTS quantity_in_stock INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS default_gst_rate INTEGER DEFAULT 18,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE vehicles
SET item_name = TRIM(CONCAT_WS(' ',
  NULLIF(make, ''),
  NULLIF(model, ''),
  NULLIF(variant, '')
))
WHERE COALESCE(item_name, '') = '';

UPDATE vehicles
SET sku = chassis_number
WHERE sku IS NULL AND chassis_number IS NOT NULL;

UPDATE vehicles
SET hsn_code = COALESCE(hsn_code, '8703')
WHERE hsn_code IS NULL;

UPDATE vehicles
SET quantity_in_stock = CASE WHEN status = 'in_stock' THEN 1 ELSE 0 END
WHERE quantity_in_stock IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_sku_company
ON vehicles(sku, company_id)
WHERE is_deleted = FALSE AND sku IS NOT NULL AND btrim(sku) <> '';

CREATE INDEX IF NOT EXISTS idx_vehicles_item_name ON vehicles(company_id, item_name);
CREATE INDEX IF NOT EXISTS idx_vehicles_category ON vehicles(company_id, category);
CREATE INDEX IF NOT EXISTS idx_vehicles_brand ON vehicles(company_id, brand);

CREATE TABLE IF NOT EXISTS item_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL,
  field_label VARCHAR(200) NOT NULL,
  field_type VARCHAR(20) NOT NULL DEFAULT 'text',
  field_options TEXT[],
  is_required BOOLEAN DEFAULT FALSE,
  show_in_list BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, field_key)
);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS item_terminology VARCHAR(100) DEFAULT 'Product',
  ADD COLUMN IF NOT EXISTS item_terminology_plural VARCHAR(100) DEFAULT 'Products',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_defaults JSONB DEFAULT '{"additional_line_item_types":[{"label":"Service Charge","hsn_code":"","gst_rate":18},{"label":"Delivery","hsn_code":"","gst_rate":18},{"label":"Labour","hsn_code":"","gst_rate":18},{"label":"Other","hsn_code":"","gst_rate":18}]}'::jsonb;

ALTER TABLE companies
  ALTER COLUMN default_hsn_code SET DEFAULT '',
  ALTER COLUMN default_gst_rate SET DEFAULT 18;

UPDATE companies
SET item_terminology = COALESCE(NULLIF(item_terminology, ''), 'Product'),
    item_terminology_plural = COALESCE(NULLIF(item_terminology_plural, ''), 'Products'),
    default_hsn_code = COALESCE(default_hsn_code, ''),
    default_gst_rate = COALESCE(default_gst_rate, 18);

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_vehicle_id ON invoice_items(vehicle_id);

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotation_items_vehicle_id ON quotation_items(vehicle_id);
