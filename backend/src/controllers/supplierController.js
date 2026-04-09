const { query } = require('../config/db');
const { logAudit } = require('../middleware/auditLog');

async function createSupplier(req, res) {
  const company_id = req.user.company_id;
  const d = req.validated;
  const { rows } = await query(
    `INSERT INTO suppliers
       (company_id, name, gstin, phone, email, address, state, bank_name, bank_account, ifsc_code, tcs_applicable, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      company_id, d.name, d.gstin || null, d.phone || null, d.email || null,
      d.address || null, d.state || null, d.bank_name || null, d.bank_account || null,
      d.ifsc_code || null, d.tcs_applicable ?? false, d.is_active ?? true,
    ],
  );
  logAudit({
    companyId: company_id, userId: req.user.id, action: 'create', entity: 'supplier',
    entityId: rows[0].id, newValue: { name: rows[0].name }, req,
  });
  res.status(201).json(rows[0]);
}

async function listSuppliers(req, res) {
  const company_id = req.user.company_id;
  const { search, limit = 100 } = req.query;
  const params = [company_id];
  let sql = `SELECT * FROM suppliers WHERE company_id = $1 AND is_deleted = FALSE`;
  if (search && String(search).trim()) {
    sql += ` AND (name ILIKE $2 OR gstin ILIKE $2)`;
    params.push(`%${String(search).trim()}%`);
  }
  sql += ` ORDER BY name ASC LIMIT ${Math.min(500, Math.max(1, Number(limit)))}`;
  const { rows } = await query(sql, params);
  res.json({ suppliers: rows });
}

async function getSupplier(req, res) {
  const { rows } = await query(
    `SELECT * FROM suppliers WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [req.params.id, req.user.company_id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
  res.json(rows[0]);
}

async function updateSupplier(req, res) {
  const company_id = req.user.company_id;
  const d = req.validated;
  const fields = [];
  const vals = [];
  let i = 1;
  const map = {
    name: 'name', gstin: 'gstin', phone: 'phone', email: 'email', address: 'address',
    state: 'state', bank_name: 'bank_name', bank_account: 'bank_account', ifsc_code: 'ifsc_code',
    tcs_applicable: 'tcs_applicable', is_active: 'is_active',
  };
  for (const [k, col] of Object.entries(map)) {
    if (d[k] !== undefined) {
      fields.push(`${col} = $${i++}`);
      vals.push(d[k]);
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  fields.push(`updated_at = NOW()`);
  vals.push(req.params.id, company_id);
  const { rows } = await query(
    `UPDATE suppliers SET ${fields.join(', ')}
     WHERE id = $${i++} AND company_id = $${i} AND is_deleted = FALSE
     RETURNING *`,
    vals,
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
  logAudit({
    companyId: company_id, userId: req.user.id, action: 'update', entity: 'supplier',
    entityId: req.params.id, newValue: d, req,
  });
  res.json(rows[0]);
}

module.exports = { createSupplier, listSuppliers, getSupplier, updateSupplier };
