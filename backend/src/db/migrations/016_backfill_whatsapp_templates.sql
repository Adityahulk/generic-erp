-- Backfill default WhatsApp templates for any company that was created
-- after migration 012 ran, or whose templates were otherwise missing.
-- Uses ON CONFLICT DO NOTHING so existing customised templates are never overwritten.

INSERT INTO whatsapp_templates (company_id, name, message_type, template_body)
SELECT c.id, 'Invoice share', 'invoice_share',
'Dear {customer_name},

Thank you for your purchase from {company_name}!

Invoice No: {invoice_number}
Vehicle: {vehicle}
Amount: Rs.{amount}

View/Download your invoice: {share_link}

For any queries, call us at {branch_phone}

— {company_name}'
FROM companies c WHERE c.is_deleted = FALSE
ON CONFLICT (company_id, message_type) DO NOTHING;

INSERT INTO whatsapp_templates (company_id, name, message_type, template_body)
SELECT c.id, 'Quotation share', 'quotation_share',
'Dear {customer_name},

Please find your quotation from {company_name}.

Quotation No: {quotation_number}
Vehicle: {vehicle}
Total: Rs.{amount}
Valid Until: {valid_until}

View quotation: {share_link}

To confirm your booking or for queries:
{branch_phone}

— {company_name}'
FROM companies c WHERE c.is_deleted = FALSE
ON CONFLICT (company_id, message_type) DO NOTHING;

INSERT INTO whatsapp_templates (company_id, name, message_type, template_body)
SELECT c.id, 'Loan overdue', 'loan_overdue',
'Dear {customer_name},

Your vehicle loan for {vehicle} is overdue.

Due Date: {due_date}
Overdue By: {overdue_days} days
Outstanding Penalty: Rs.{penalty}

Please contact us immediately to avoid further charges.
{branch_phone}

— {company_name}'
FROM companies c WHERE c.is_deleted = FALSE
ON CONFLICT (company_id, message_type) DO NOTHING;

INSERT INTO whatsapp_templates (company_id, name, message_type, template_body)
SELECT c.id, 'Loan penalty alert', 'loan_penalty_alert',
'Dear {customer_name},

This is a reminder that your loan payment for {vehicle} is pending.

Due Date: {due_date}
Days Overdue: {overdue_days}
Daily Penalty: Rs.{penalty_per_day}
Total Penalty So Far: Rs.{penalty}

Please clear your dues to stop penalty accumulation.
{branch_phone}

— {company_name}'
FROM companies c WHERE c.is_deleted = FALSE
ON CONFLICT (company_id, message_type) DO NOTHING;
