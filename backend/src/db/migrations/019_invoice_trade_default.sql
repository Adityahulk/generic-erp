-- Prefer "GST Trade Invoice (full)" as the default PDF template when it exists for a company.

UPDATE invoice_templates it
SET is_default = FALSE
WHERE it.company_id IN (
  SELECT company_id FROM invoice_templates
  WHERE template_key = 'trade'
    AND name = 'GST Trade Invoice (full)'
    AND is_deleted = FALSE
)
AND it.is_deleted = FALSE;

UPDATE invoice_templates it
SET is_default = TRUE
WHERE it.template_key = 'trade'
  AND it.name = 'GST Trade Invoice (full)'
  AND it.is_deleted = FALSE;
