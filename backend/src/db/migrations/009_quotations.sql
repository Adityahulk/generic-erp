-- Replace legacy quotations (JSONB items) with relational quotation_items and extended fields.

DROP TRIGGER IF EXISTS set_updated_at ON quotations;

DROP TABLE IF EXISTS quotation_items CASCADE;
DROP TABLE IF EXISTS quotations CASCADE;

DROP TYPE IF EXISTS quotation_status CASCADE;

CREATE TYPE quotation_status AS ENUM (
  'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'
);

CREATE TYPE quotation_item_type AS ENUM (
  'vehicle', 'accessory', 'insurance', 'rto', 'other'
);

CREATE TYPE quotation_line_discount_type AS ENUM ('flat', 'percent', 'none');

CREATE TYPE quotation_header_discount_type AS ENUM ('flat', 'percent');

CREATE TABLE quotations (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                UUID NOT NULL REFERENCES companies(id),
  branch_id                 UUID NOT NULL REFERENCES branches(id),
  quotation_number          VARCHAR(80) NOT NULL,
  quotation_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until_date          DATE,
  customer_id               UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name_override    VARCHAR(255),
  customer_phone_override   VARCHAR(50),
  customer_email_override   VARCHAR(255),
  customer_address_override TEXT,
  vehicle_id                UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  vehicle_details_override  JSONB,
  status                    quotation_status NOT NULL DEFAULT 'draft',
  subtotal                  BIGINT NOT NULL DEFAULT 0,
  discount_type             quotation_header_discount_type NOT NULL DEFAULT 'flat',
  discount_value            BIGINT NOT NULL DEFAULT 0,
  discount_amount           BIGINT NOT NULL DEFAULT 0,
  cgst_amount               BIGINT NOT NULL DEFAULT 0,
  sgst_amount               BIGINT NOT NULL DEFAULT 0,
  igst_amount               BIGINT NOT NULL DEFAULT 0,
  total                     BIGINT NOT NULL DEFAULT 0,
  notes                     TEXT,
  customer_notes            TEXT,
  terms_and_conditions      TEXT,
  prepared_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  converted_to_invoice_id   UUID REFERENCES invoices(id) ON DELETE SET NULL,
  converted_at              TIMESTAMPTZ,
  sent_at                   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted                BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX idx_quotations_number_company ON quotations(quotation_number, company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_quotations_company_id ON quotations(company_id);
CREATE INDEX idx_quotations_branch_id ON quotations(branch_id);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_quotations_quotation_date ON quotations(quotation_date);
CREATE INDEX idx_quotations_valid_until ON quotations(valid_until_date);
CREATE INDEX idx_quotations_created_at ON quotations(created_at);

CREATE TABLE quotation_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id     UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  company_id       UUID NOT NULL REFERENCES companies(id),
  item_type        quotation_item_type NOT NULL DEFAULT 'other',
  description      VARCHAR(500) NOT NULL,
  hsn_code         VARCHAR(20),
  quantity         INTEGER NOT NULL DEFAULT 1,
  unit_price       BIGINT NOT NULL DEFAULT 0,
  discount_type    quotation_line_discount_type NOT NULL DEFAULT 'none',
  discount_value   BIGINT NOT NULL DEFAULT 0,
  discount_amount  BIGINT NOT NULL DEFAULT 0,
  cgst_rate        DECIMAL(5,2) NOT NULL DEFAULT 0,
  sgst_rate        DECIMAL(5,2) NOT NULL DEFAULT 0,
  igst_rate        DECIMAL(5,2) NOT NULL DEFAULT 0,
  cgst_amount      BIGINT NOT NULL DEFAULT 0,
  sgst_amount      BIGINT NOT NULL DEFAULT 0,
  igst_amount      BIGINT NOT NULL DEFAULT 0,
  amount           BIGINT NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_quotation_items_quotation_id ON quotation_items(quotation_id);
CREATE INDEX idx_quotation_items_company_id ON quotation_items(company_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON quotation_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
