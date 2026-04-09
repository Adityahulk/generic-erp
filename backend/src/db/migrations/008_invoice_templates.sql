-- Invoice templates (per company). Filename 008: 003 is already audit_logs in this repo.

CREATE TABLE invoice_templates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  name           VARCHAR(255) NOT NULL,
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  template_key   VARCHAR(50) NOT NULL,
  layout_config  JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_invoice_templates_company_id ON invoice_templates(company_id) WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX idx_invoice_templates_one_default_per_company
  ON invoice_templates(company_id)
  WHERE is_deleted = FALSE AND is_default = TRUE;

-- Seed two templates for every existing company
INSERT INTO invoice_templates (company_id, name, is_default, template_key, layout_config)
SELECT c.id,
       'Standard GST Invoice',
       TRUE,
       'standard',
       '{"show_logo": true, "show_signature": true, "show_qr_code": false, "show_bank_details": false, "show_terms": true, "terms_text": "Goods once sold will not be taken back or exchanged. Subject to local jurisdiction.", "primary_color": "#1a56db", "font": "default", "header_style": "left-aligned", "show_vehicle_details_block": true, "show_loan_summary": false, "footer_text": "", "bank_details": ""}'::jsonb
FROM companies c
WHERE c.is_deleted = FALSE;

INSERT INTO invoice_templates (company_id, name, is_default, template_key, layout_config)
SELECT c.id,
       'Simple Invoice',
       FALSE,
       'simple',
       '{"show_logo": false, "show_signature": true, "show_qr_code": false, "show_bank_details": false, "show_terms": false, "terms_text": "", "primary_color": "#374151", "font": "default", "header_style": "left-aligned", "show_vehicle_details_block": true, "show_loan_summary": false, "footer_text": "", "bank_details": ""}'::jsonb
FROM companies c
WHERE c.is_deleted = FALSE;
