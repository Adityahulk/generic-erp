-- E-Invoice fields on invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS irn           VARCHAR(64),
  ADD COLUMN IF NOT EXISTS irn_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ack_number    BIGINT,
  ADD COLUMN IF NOT EXISTS ack_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_qr     TEXT,
  ADD COLUMN IF NOT EXISTS signed_invoice TEXT,
  ADD COLUMN IF NOT EXISTS irn_status    VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS irn_cancel_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS irn_cancel_reason VARCHAR(255);

COMMENT ON COLUMN invoices.irn IS 'Invoice Reference Number from NIC IRP';
COMMENT ON COLUMN invoices.irn_status IS 'pending | generated | cancelled | failed';

CREATE INDEX IF NOT EXISTS idx_invoices_irn ON invoices(irn) WHERE irn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_irn_status ON invoices(irn_status);

-- Cache for NIC auth tokens per company GSTIN
CREATE TABLE IF NOT EXISTS einvoice_tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  gstin        VARCHAR(15) NOT NULL,
  auth_token   TEXT NOT NULL,
  sek          TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, gstin)
);
