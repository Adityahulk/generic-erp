-- Purchase module: suppliers, purchase orders, receipts, branch codes, vehicle link

ALTER TABLE branches ADD COLUMN IF NOT EXISTS code VARCHAR(20);

-- Short codes for PO numbering (backfill: compress name to alphanum prefix)
UPDATE branches SET code = UPPER(LEFT(REPLACE(REPLACE(REPLACE(TRIM(name), ' ', ''), '-', ''), '_', ''), 6))
WHERE code IS NULL OR TRIM(COALESCE(code, '')) = '';

CREATE TYPE purchase_order_status AS ENUM ('draft', 'confirmed', 'received', 'cancelled');
CREATE TYPE purchase_receipt_status AS ENUM ('partial', 'complete');

CREATE TABLE suppliers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          VARCHAR(255) NOT NULL,
  gstin         VARCHAR(15),
  phone         VARCHAR(20),
  email         VARCHAR(255),
  address       TEXT,
  state         VARCHAR(100),
  bank_name     VARCHAR(255),
  bank_account  VARCHAR(50),
  ifsc_code     VARCHAR(20),
  tcs_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_suppliers_company_id ON suppliers(company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_suppliers_name ON suppliers(company_id, name) WHERE is_deleted = FALSE;
CREATE INDEX idx_suppliers_gstin ON suppliers(company_id, gstin) WHERE is_deleted = FALSE AND gstin IS NOT NULL;

CREATE TABLE purchase_orders (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id),
  branch_id               UUID NOT NULL REFERENCES branches(id),
  po_number               VARCHAR(80) NOT NULL,
  supplier_id             UUID NOT NULL REFERENCES suppliers(id),
  order_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date  DATE,
  status                  purchase_order_status NOT NULL DEFAULT 'draft',
  subtotal                BIGINT NOT NULL DEFAULT 0,
  discount                BIGINT NOT NULL DEFAULT 0,
  cgst_amount             BIGINT NOT NULL DEFAULT 0,
  sgst_amount             BIGINT NOT NULL DEFAULT 0,
  igst_amount             BIGINT NOT NULL DEFAULT 0,
  tcs_amount              BIGINT NOT NULL DEFAULT 0,
  total                   BIGINT NOT NULL DEFAULT 0,
  notes                   TEXT,
  created_by              UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX idx_purchase_orders_number_company ON purchase_orders(po_number, company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_purchase_orders_company_id ON purchase_orders(company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_purchase_orders_branch_id ON purchase_orders(branch_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_purchase_orders_supplier_id ON purchase_orders(supplier_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_purchase_orders_status ON purchase_orders(company_id, status) WHERE is_deleted = FALSE;
CREATE INDEX idx_purchase_orders_order_date ON purchase_orders(company_id, order_date) WHERE is_deleted = FALSE;

CREATE TABLE purchase_order_items (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id  UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  vehicle_id         UUID REFERENCES vehicles(id),
  description        VARCHAR(500) NOT NULL,
  hsn_code           VARCHAR(20),
  quantity           INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price         BIGINT NOT NULL DEFAULT 0,
  cgst_rate          DECIMAL(5,2) NOT NULL DEFAULT 0,
  sgst_rate          DECIMAL(5,2) NOT NULL DEFAULT 0,
  igst_rate          DECIMAL(5,2) NOT NULL DEFAULT 0,
  cgst_amount        BIGINT NOT NULL DEFAULT 0,
  sgst_amount        BIGINT NOT NULL DEFAULT 0,
  igst_amount        BIGINT NOT NULL DEFAULT 0,
  amount             BIGINT NOT NULL DEFAULT 0,
  vehicle_data       JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_order_items_po_id ON purchase_order_items(purchase_order_id);

CREATE TABLE purchase_receipts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  purchase_order_id  UUID NOT NULL REFERENCES purchase_orders(id),
  branch_id          UUID NOT NULL REFERENCES branches(id),
  received_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by        UUID REFERENCES users(id),
  notes              TEXT,
  status             purchase_receipt_status NOT NULL DEFAULT 'partial',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_receipts_po_id ON purchase_receipts(purchase_order_id);
CREATE INDEX idx_purchase_receipts_company_id ON purchase_receipts(company_id);

CREATE TABLE purchase_receipt_items (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_receipt_id     UUID NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id  UUID NOT NULL REFERENCES purchase_order_items(id),
  quantity_received       INTEGER NOT NULL CHECK (quantity_received > 0),
  vehicle_data            JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_receipt_items_receipt_id ON purchase_receipt_items(purchase_receipt_id);
CREATE INDEX idx_purchase_receipt_items_po_item_id ON purchase_receipt_items(purchase_order_item_id);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_purchase_order_id ON vehicles(purchase_order_id);
