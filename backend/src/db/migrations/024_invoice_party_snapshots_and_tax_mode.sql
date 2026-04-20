-- Invoice-level editable party snapshots (seller, billing, shipping)
-- and per-line tax mode selection.

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS seller_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS seller_gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS seller_address TEXT,
ADD COLUMN IF NOT EXISTS seller_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS seller_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS bill_to_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS bill_to_gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS bill_to_address TEXT,
ADD COLUMN IF NOT EXISTS bill_to_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS bill_to_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS ship_to_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS ship_to_gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS ship_to_address TEXT,
ADD COLUMN IF NOT EXISTS ship_to_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS ship_to_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS ship_to_same_as_billing BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) NOT NULL DEFAULT 'auto';

CREATE INDEX IF NOT EXISTS idx_invoice_items_tax_mode ON invoice_items(tax_mode);
