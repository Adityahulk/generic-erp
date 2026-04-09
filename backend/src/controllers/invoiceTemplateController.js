const { query, getClient } = require('../config/db');
const { logAudit } = require('../middleware/auditLog');
const { DEFAULT_LAYOUT } = require('../constants/invoiceLayoutDefaults');

async function seedDefaultInvoiceTemplates(companyId) {
  await query(
    `INSERT INTO invoice_templates (company_id, name, is_default, template_key, layout_config)
     VALUES
       ($1, 'Standard GST Invoice', TRUE, 'standard', $2::jsonb),
       ($1, 'Simple Invoice', FALSE, 'simple', $3::jsonb)`,
    [
      companyId,
      JSON.stringify({ ...DEFAULT_LAYOUT, show_logo: true, show_terms: true, primary_color: '#1a56db' }),
      JSON.stringify({
        ...DEFAULT_LAYOUT,
        show_logo: false,
        show_terms: false,
        terms_text: '',
        primary_color: '#374151',
      }),
    ],
  );
}

async function listTemplates(req, res) {
  const company_id = req.user.company_id;
  const { rows } = await query(
    `SELECT id, company_id, name, is_default, template_key, layout_config, created_at, updated_at
     FROM invoice_templates
     WHERE company_id = $1 AND is_deleted = FALSE
     ORDER BY is_default DESC, name ASC`,
    [company_id],
  );
  res.json({ templates: rows });
}

async function createTemplate(req, res) {
  const company_id = req.user.company_id;
  const d = req.validated;
  const layout = { ...DEFAULT_LAYOUT, ...d.layout_config };

  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (d.is_default) {
      await client.query(
        `UPDATE invoice_templates SET is_default = FALSE, updated_at = NOW()
         WHERE company_id = $1 AND is_deleted = FALSE`,
        [company_id],
      );
    }
    const { rows } = await client.query(
      `INSERT INTO invoice_templates (company_id, name, is_default, template_key, layout_config)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [company_id, d.name, d.is_default || false, d.template_key, JSON.stringify(layout)],
    );
    await client.query('COMMIT');
    logAudit({
      companyId: company_id, userId: req.user.id, action: 'create', entity: 'invoice_template',
      entityId: rows[0].id, newValue: { name: rows[0].name }, req,
    });
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function updateTemplate(req, res) {
  const company_id = req.user.company_id;
  const { id } = req.params;
  const d = req.validated;

  const { rows: cur } = await query(
    `SELECT * FROM invoice_templates WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [id, company_id],
  );
  if (cur.length === 0) return res.status(404).json({ error: 'Template not found' });

  const prevLayout = typeof cur[0].layout_config === 'object' && cur[0].layout_config
    ? cur[0].layout_config
    : {};
  const mergedLayout = d.layout_config
    ? { ...DEFAULT_LAYOUT, ...prevLayout, ...d.layout_config }
    : prevLayout;

  const fields = [];
  const vals = [];
  let i = 1;
  if (d.name !== undefined) {
    fields.push(`name = $${i++}`);
    vals.push(d.name);
  }
  if (d.layout_config !== undefined) {
    fields.push(`layout_config = $${i++}::jsonb`);
    vals.push(JSON.stringify(mergedLayout));
  }
  if (fields.length === 0) return res.status(400).json({ error: 'No updates' });
  fields.push('updated_at = NOW()');
  vals.push(id, company_id);
  const { rows } = await query(
    `UPDATE invoice_templates SET ${fields.join(', ')}
     WHERE id = $${i++} AND company_id = $${i} AND is_deleted = FALSE
     RETURNING *`,
    vals,
  );
  logAudit({
    companyId: company_id, userId: req.user.id, action: 'update', entity: 'invoice_template',
    entityId: id, req,
  });
  res.json(rows[0]);
}

async function deleteTemplate(req, res) {
  const company_id = req.user.company_id;
  const { id } = req.params;
  const { rows } = await query(
    `SELECT is_default FROM invoice_templates WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [id, company_id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
  if (rows[0].is_default) {
    return res.status(400).json({ error: 'Cannot delete the default template' });
  }
  await query(
    `UPDATE invoice_templates SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
    [id],
  );
  logAudit({
    companyId: company_id, userId: req.user.id, action: 'delete', entity: 'invoice_template',
    entityId: id, req,
  });
  res.json({ message: 'Template deleted' });
}

async function setDefaultTemplate(req, res) {
  const company_id = req.user.company_id;
  const { id } = req.params;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM invoice_templates WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE FOR UPDATE`,
      [id, company_id],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Template not found' });
    }
    await client.query(
      `UPDATE invoice_templates SET is_default = FALSE, updated_at = NOW()
       WHERE company_id = $1 AND is_deleted = FALSE`,
      [company_id],
    );
    await client.query(
      `UPDATE invoice_templates SET is_default = TRUE, updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await client.query('COMMIT');
    const { rows: out } = await query(
      `SELECT * FROM invoice_templates WHERE id = $1`,
      [id],
    );
    res.json(out[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setDefaultTemplate,
  seedDefaultInvoiceTemplates,
  DEFAULT_LAYOUT,
};
