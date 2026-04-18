const { query, getClient } = require('../config/db');
const { ROLE_HIERARCHY } = require('../middleware/role');
const { logAudit } = require('../middleware/auditLog');
const { generateBarcodeBuffer, generateQRCodeBuffer, generateVehicleLabelHTML, generateBatchLabelsHTML } = require('../services/barcodeService');
const { htmlToPdfBuffer } = require('../services/pdfService');

function buildItemName(data) {
  const parts = [data.item_name, data.make, data.model, data.variant]
    .map((value) => (typeof value === 'string' ? value.trim() : value))
    .filter(Boolean);
  return parts[0] ? parts.join(' ') : null;
}

function normalizeVehiclePayload(data, fallback = {}) {
  const item_name = buildItemName(data) || fallback.item_name || null;
  const sku = (data.sku || fallback.sku || data.chassis_number || fallback.chassis_number || '').trim() || null;
  const is_serialized = data.is_serialized !== undefined ? data.is_serialized : (fallback.is_serialized ?? true);
  const rawQty = data.quantity_in_stock !== undefined ? Number(data.quantity_in_stock) : Number(fallback.quantity_in_stock ?? (is_serialized ? 1 : 1));
  const quantity_in_stock = is_serialized
    ? ((data.status || fallback.status) === 'in_stock' ? 1 : 0)
    : Math.max(0, rawQty || 0);

  return {
    item_name,
    sku,
    category: data.category !== undefined ? data.category : fallback.category || null,
    brand: data.brand !== undefined ? data.brand : fallback.brand || data.make || null,
    unit_of_measure: data.unit_of_measure !== undefined ? data.unit_of_measure : fallback.unit_of_measure || 'Pcs',
    quantity_in_stock,
    is_serialized,
    hsn_code: data.hsn_code !== undefined ? data.hsn_code : fallback.hsn_code || null,
    default_gst_rate: data.default_gst_rate !== undefined ? data.default_gst_rate : Number(fallback.default_gst_rate ?? 18),
    custom_fields: (data.custom_fields && typeof data.custom_fields === 'object' && !Array.isArray(data.custom_fields))
      ? data.custom_fields
      : (fallback.custom_fields || {}),
    notes: data.notes !== undefined ? data.notes : (fallback.notes || null),
    chassis_number: data.chassis_number !== undefined ? data.chassis_number : fallback.chassis_number || null,
    engine_number: data.engine_number !== undefined ? data.engine_number : fallback.engine_number || null,
    make: data.make !== undefined ? data.make : fallback.make || null,
    model: data.model !== undefined ? data.model : fallback.model || null,
    variant: data.variant !== undefined ? data.variant : fallback.variant || null,
    color: data.color !== undefined ? data.color : fallback.color || null,
    year: data.year !== undefined ? data.year : fallback.year || null,
    purchase_price: data.purchase_price !== undefined ? data.purchase_price : Number(fallback.purchase_price || 0),
    selling_price: data.selling_price !== undefined ? data.selling_price : Number(fallback.selling_price || 0),
    status: data.status !== undefined ? data.status : fallback.status || 'in_stock',
    rto_number: data.rto_number !== undefined ? data.rto_number : fallback.rto_number || null,
    rto_date: data.rto_date !== undefined ? data.rto_date : fallback.rto_date || null,
    insurance_company: data.insurance_company !== undefined ? data.insurance_company : fallback.insurance_company || null,
    insurance_expiry: data.insurance_expiry !== undefined ? data.insurance_expiry : fallback.insurance_expiry || null,
    insurance_number: data.insurance_number !== undefined ? data.insurance_number : fallback.insurance_number || null,
  };
}

async function getCompanyDefaults(companyId) {
  const { rows } = await query(
    `SELECT default_hsn_code, default_gst_rate FROM companies WHERE id = $1 AND is_deleted = FALSE`,
    [companyId],
  );
  return rows[0] || { default_hsn_code: '', default_gst_rate: 18 };
}

async function listVehicles(req, res) {
  const company_id = req.user.company_id;
  const { role, branch_id: userBranch } = req.user;
  const { branch_id, status, search, category, brand, page = 1, limit = 50 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

  const conditions = ['v.company_id = $1', 'v.is_deleted = FALSE'];
  const params = [company_id];
  let idx = 2;

  // staff and branch_manager scoped to their branch
  if (role === 'staff' || role === 'branch_manager') {
    conditions.push(`v.branch_id = $${idx++}`);
    params.push(userBranch);
  } else if (branch_id) {
    conditions.push(`v.branch_id = $${idx++}`);
    params.push(branch_id);
  }

  if (status) {
    conditions.push(`v.status = $${idx++}`);
    params.push(status);
  }

  if (search) {
    conditions.push(
      `(
        v.item_name ILIKE $${idx}
        OR v.sku ILIKE $${idx}
        OR v.brand ILIKE $${idx}
        OR v.category ILIKE $${idx}
        OR v.chassis_number ILIKE $${idx}
        OR v.make ILIKE $${idx}
        OR v.model ILIKE $${idx}
      )`,
    );
    params.push(`%${search}%`);
    idx++;
  }

  if (category) {
    conditions.push(`COALESCE(v.category, '') ILIKE $${idx++}`);
    params.push(`%${category}%`);
  }

  if (brand) {
    conditions.push(`COALESCE(v.brand, '') ILIKE $${idx++}`);
    params.push(`%${brand}%`);
  }

  const where = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) FROM vehicles v WHERE ${where}`,
    params,
  );

  params.push(Number(limit), offset);
  const { rows } = await query(
    `SELECT v.*, b.name AS branch_name
     FROM vehicles v
     LEFT JOIN branches b ON b.id = v.branch_id
     WHERE ${where}
     ORDER BY v.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  res.json({
    vehicles: rows,
    total: parseInt(countResult.rows[0].count, 10),
    page: Number(page),
    limit: Number(limit),
  });
}

async function createVehicle(req, res) {
  const company_id = req.user.company_id;
  const companyDefaults = await getCompanyDefaults(company_id);
  const data = normalizeVehiclePayload({
    ...companyDefaults,
    ...req.validated,
    hsn_code: req.validated.hsn_code ?? companyDefaults.default_hsn_code,
    default_gst_rate: req.validated.default_gst_rate ?? Number(companyDefaults.default_gst_rate || 18),
  });

  if (!data.item_name) {
    return res.status(400).json({ error: 'item_name is required' });
  }

  // staff can only add to their own branch
  const callerLevel = ROLE_HIERARCHY[req.user.role] || 0;
  let branch_id = req.validated.branch_id;
  if (callerLevel < ROLE_HIERARCHY.branch_manager) {
    branch_id = req.user.branch_id;
  }
  if (!branch_id) {
    return res.status(400).json({ error: 'branch_id is required' });
  }

  // validate branch belongs to company
  const branchCheck = await query(
    `SELECT id FROM branches WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [branch_id, company_id],
  );
  if (branchCheck.rows.length === 0) {
    return res.status(400).json({ error: 'Invalid branch' });
  }

  if (data.sku) {
    const dup = await query(
      `SELECT id FROM vehicles WHERE sku = $1 AND company_id = $2 AND is_deleted = FALSE`,
      [data.sku, company_id],
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'An item with this SKU already exists' });
    }
  }

  const { rows } = await query(
    `INSERT INTO vehicles
       (company_id, branch_id, item_name, sku, category, brand, unit_of_measure,
        quantity_in_stock, is_serialized, hsn_code, default_gst_rate, custom_fields, notes,
        chassis_number, engine_number, make, model, variant, color, year, purchase_price,
        selling_price, status, rto_number, rto_date, insurance_company, insurance_expiry, insurance_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     RETURNING *`,
    [
      company_id, branch_id, data.item_name, data.sku, data.category, data.brand, data.unit_of_measure,
      data.quantity_in_stock, data.is_serialized, data.hsn_code, data.default_gst_rate, JSON.stringify(data.custom_fields || {}), data.notes,
      data.chassis_number, data.engine_number, data.make, data.model, data.variant, data.color, data.year,
      data.purchase_price, data.selling_price, data.status,
      data.rto_number, data.rto_date, data.insurance_company, data.insurance_expiry, data.insurance_number,
    ],
  );

  logAudit({ companyId: company_id, userId: req.user.id, action: 'create', entity: 'vehicle', entityId: rows[0].id, newValue: rows[0], req });
  res.status(201).json({ vehicle: rows[0] });
}

async function getVehicle(req, res) {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const { rows } = await query(
      `SELECT v.*, b.name AS branch_name
       FROM vehicles v
       LEFT JOIN branches b ON b.id = v.branch_id
       WHERE v.id = $1 AND v.company_id = $2 AND v.is_deleted = FALSE`,
      [id, company_id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // transfer history
    const transfers = await query(
      `SELECT vt.id, vt.transferred_at, vt.notes,
              fb.name AS from_branch_name, tb.name AS to_branch_name,
              u.name AS transferred_by_name
       FROM vehicle_transfers vt
       LEFT JOIN branches fb ON fb.id = vt.from_branch_id
       LEFT JOIN branches tb ON tb.id = vt.to_branch_id
       LEFT JOIN users u ON u.id = vt.transferred_by
       WHERE vt.vehicle_id = $1 AND vt.company_id = $2 AND vt.is_deleted = FALSE
       ORDER BY vt.transferred_at DESC`,
      [id, company_id],
    );

    // loan info via invoices
    const loans = await query(
      `SELECT l.id, l.bank_name, l.loan_amount, l.emi_amount, l.due_date,
              l.status, l.total_penalty_accrued, l.interest_rate, l.tenure_months,
              l.penalty_per_day, l.last_reminder_sent, l.invoice_id,
              c.name AS customer_name, c.phone AS customer_phone
       FROM loans l
       JOIN invoices i ON i.id = l.invoice_id
       LEFT JOIN customers c ON c.id = l.customer_id
      WHERE i.vehicle_id = $1 AND l.company_id = $2 AND l.is_deleted = FALSE
       ORDER BY l.created_at DESC`,
      [id, company_id],
    );

    // invoice info for the vehicle
    const invoices = await query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.total, i.status,
              c.name AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.vehicle_id = $1 AND i.company_id = $2 AND i.is_deleted = FALSE
       ORDER BY i.created_at DESC`,
      [id, company_id],
    );

    res.json({
      vehicle: rows[0],
      transfers: transfers.rows,
      loans: loans.rows,
      invoices: invoices.rows,
    });
  } catch (err) {
    console.error('getVehicle error:', err.message);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
}

async function searchVehicles(req, res) {
  try {
    const company_id = req.user.company_id;
    const { q, status } = req.query;

    if (!q || q.length < 2) {
      return res.json({ vehicles: [] });
    }

    const { rows } = await query(
      `SELECT id, item_name, sku, category, brand, unit_of_measure, quantity_in_stock,
              is_serialized, chassis_number, engine_number, make, model, variant, color, year,
              status, selling_price, hsn_code, default_gst_rate, branch_id
       FROM vehicles
       WHERE company_id = $1 AND is_deleted = FALSE
         ${status ? 'AND status = $3' : ''}
         AND (
           item_name ILIKE $2 OR sku ILIKE $2 OR brand ILIKE $2 OR category ILIKE $2
           OR chassis_number ILIKE $2 OR make ILIKE $2 OR model ILIKE $2
         )
       ORDER BY created_at DESC
       LIMIT 20`,
      status ? [company_id, `%${q}%`, status] : [company_id, `%${q}%`],
    );

    res.json({ vehicles: rows });
  } catch (err) {
    console.error('searchVehicles error:', err.message);
    res.status(500).json({ error: 'Failed to search vehicles' });
  }
}

async function expiringInsurance(req, res) {
  try {
    const company_id = req.user.company_id;
    const days = parseInt(req.query.days, 10) || 30;

    const { rows } = await query(
      `SELECT v.id, v.chassis_number, v.make, v.model, v.variant, v.color,
              v.insurance_company, v.insurance_number, v.insurance_expiry,
              v.status, b.name AS branch_name
       FROM vehicles v
       LEFT JOIN branches b ON b.id = v.branch_id
       WHERE v.company_id = $1 AND v.is_deleted = FALSE
         AND v.insurance_expiry IS NOT NULL
         AND v.insurance_expiry <= CURRENT_DATE + ($2 || ' days')::interval
       ORDER BY v.insurance_expiry ASC`,
      [company_id, String(days)],
    );

    res.json({ vehicles: rows, days });
  } catch (err) {
    console.error('expiringInsurance error:', err.message);
    res.status(500).json({ error: 'Failed to fetch expiring insurance' });
  }
}

async function updateVehicle(req, res) {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const existingResult = await query(
    `SELECT * FROM vehicles WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [id, company_id],
  );
  if (existingResult.rows.length === 0) {
    return res.status(404).json({ error: 'Item not found' });
  }
  const existingVehicle = existingResult.rows[0];
  const updates = req.validated;

  if (updates.sku) {
    const dup = await query(
      `SELECT id FROM vehicles WHERE sku = $1 AND company_id = $2 AND id != $3 AND is_deleted = FALSE`,
      [updates.sku, company_id, id],
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'An item with this SKU already exists' });
    }
  }

  if (updates.branch_id) {
    const branchCheck = await query(
      `SELECT id FROM branches WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
      [updates.branch_id, company_id],
    );
    if (branchCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid branch' });
    }
  }

  const normalized = normalizeVehiclePayload(updates, existingVehicle);
  if (updates.is_serialized === false && existingVehicle.is_serialized === true) {
    const { rows: invoiceRows } = await query(
      `SELECT id FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.vehicle_id = $1 AND i.company_id = $2 AND i.status = 'confirmed' AND i.is_deleted = FALSE
       LIMIT 1`,
      [id, company_id],
    );
    if (invoiceRows.length > 0) {
      return res.status(400).json({ error: 'Cannot change to quantity tracking after confirmed invoices exist' });
    }
  }

  const allowed = [
    'item_name', 'sku', 'category', 'brand', 'unit_of_measure', 'quantity_in_stock',
    'is_serialized', 'hsn_code', 'default_gst_rate', 'notes',
    'chassis_number', 'engine_number', 'make', 'model', 'variant', 'color', 'year',
    'purchase_price', 'selling_price', 'status', 'rto_number', 'rto_date',
    'insurance_company', 'insurance_expiry', 'insurance_number', 'branch_id',
  ];

  const setClauses = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      params.push(normalized[key]);
    }
  }

  if (updates.custom_fields !== undefined) {
    setClauses.push(`custom_fields = COALESCE(custom_fields, '{}'::jsonb) || $${idx++}::jsonb`);
    params.push(JSON.stringify(updates.custom_fields || {}));
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(id, company_id);
  const { rows } = await query(
    `UPDATE vehicles SET ${setClauses.join(', ')}
     WHERE id = $${idx++} AND company_id = $${idx} AND is_deleted = FALSE
     RETURNING *`,
    params,
  );

  logAudit({ companyId: company_id, userId: req.user.id, action: 'update', entity: 'vehicle', entityId: id, oldValue: { id }, newValue: rows[0], req });
  res.json({ vehicle: rows[0] });
}

async function listItemFieldDefinitions(req, res) {
  const { rows } = await query(
    `SELECT * FROM item_field_definitions
     WHERE company_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [req.user.company_id],
  );
  res.json({ fields: rows });
}

async function createItemFieldDefinition(req, res) {
  const company_id = req.user.company_id;
  const payload = {
    ...req.validated,
    field_key: req.validated.field_key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''),
  };
  const { rows: dup } = await query(
    `SELECT id FROM item_field_definitions WHERE company_id = $1 AND field_key = $2`,
    [company_id, payload.field_key],
  );
  if (dup.length > 0) {
    return res.status(409).json({ error: 'Field key already exists' });
  }
  const { rows } = await query(
    `INSERT INTO item_field_definitions
       (company_id, field_key, field_label, field_type, field_options, is_required, show_in_list, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      company_id,
      payload.field_key,
      payload.field_label,
      payload.field_type,
      payload.field_type === 'dropdown' ? payload.field_options : [],
      payload.is_required,
      payload.show_in_list,
      payload.sort_order || 0,
    ],
  );
  res.status(201).json({ field: rows[0] });
}

async function deleteItemFieldDefinition(req, res) {
  const { rows } = await query(
    `DELETE FROM item_field_definitions
     WHERE id = $1 AND company_id = $2
     RETURNING id`,
    [req.params.id, req.user.company_id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Field definition not found' });
  res.json({ success: true });
}

async function transferVehicle(req, res) {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const { to_branch_id, notes } = req.validated;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: vehicles } = await client.query(
      `SELECT id, branch_id, status FROM vehicles
       WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE
       FOR UPDATE`,
      [id, company_id],
    );

    if (vehicles.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const vehicle = vehicles[0];

    if (vehicle.status !== 'in_stock') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only in_stock vehicles can be transferred' });
    }

    if (vehicle.branch_id === to_branch_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Vehicle is already at the target branch' });
    }

    // validate target branch
    const branchCheck = await client.query(
      `SELECT id FROM branches WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
      [to_branch_id, company_id],
    );
    if (branchCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid target branch' });
    }

    // create transfer record
    const { rows: transfers } = await client.query(
      `INSERT INTO vehicle_transfers
         (company_id, vehicle_id, from_branch_id, to_branch_id, transferred_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [company_id, id, vehicle.branch_id, to_branch_id, req.user.id, notes || null],
    );

    // update vehicle branch
    await client.query(
      `UPDATE vehicles SET branch_id = $1, status = 'in_stock' WHERE id = $2`,
      [to_branch_id, id],
    );

    await client.query('COMMIT');

    logAudit({ companyId: company_id, userId: req.user.id, action: 'update', entity: 'vehicle', entityId: id, oldValue: { branch_id: vehicle.branch_id }, newValue: { branch_id: to_branch_id, transfer_id: transfers[0].id }, req });
    res.json({ transfer: transfers[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function inventorySummary(req, res) {
  const company_id = req.user.company_id;

  const { rows } = await query(
    `SELECT b.id AS branch_id, b.name AS branch_name, v.status, COUNT(*)::int AS count
     FROM vehicles v
     JOIN branches b ON b.id = v.branch_id
     WHERE v.company_id = $1 AND v.is_deleted = FALSE AND b.is_deleted = FALSE
     GROUP BY b.id, b.name, v.status
     ORDER BY b.name, v.status`,
    [company_id],
  );

  // reshape into { branch_id, branch_name, in_stock, sold, transferred, scrapped, total }
  const branchMap = {};
  for (const row of rows) {
    if (!branchMap[row.branch_id]) {
      branchMap[row.branch_id] = {
        branch_id: row.branch_id,
        branch_name: row.branch_name,
        in_stock: 0, sold: 0, transferred: 0, scrapped: 0, total: 0,
      };
    }
    branchMap[row.branch_id][row.status] = row.count;
    branchMap[row.branch_id].total += row.count;
  }

  res.json({ summary: Object.values(branchMap) });
}

async function branchInventory(req, res) {
  const company_id = req.user.company_id;
  const { branchId } = req.params;

  const branchCheck = await query(
    `SELECT id, name FROM branches WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [branchId, company_id],
  );
  if (branchCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Branch not found' });
  }

  const { rows } = await query(
    `SELECT v.*, b.name AS branch_name
     FROM vehicles v
     LEFT JOIN branches b ON b.id = v.branch_id
     WHERE v.branch_id = $1 AND v.company_id = $2 AND v.status = 'in_stock' AND v.is_deleted = FALSE
     ORDER BY v.created_at DESC`,
    [branchId, company_id],
  );

  res.json({ branch: branchCheck.rows[0], vehicles: rows });
}

async function checkSkuAvailable(req, res) {
  const sku = String(req.query.sku || req.query.chassis_number || '').trim();
  if (!sku) return res.status(400).json({ error: 'sku query parameter is required' });
  const { rows } = await query(
    `SELECT id FROM vehicles WHERE sku = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [sku, req.user.company_id],
  );
  res.json({ available: rows.length === 0 });
}

async function getBarcode(req, res) {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;
    const { rows } = await query(`SELECT COALESCE(NULLIF(sku, ''), chassis_number, item_name, id::text) AS code FROM vehicles WHERE id = $1 AND company_id = $2`, [id, company_id]);
    if (!rows.length) return res.status(404).send('Not found');
    const buf = await generateBarcodeBuffer(rows[0].code);
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    res.status(500).send('Error');
  }
}

async function getQRCode(req, res) {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;
    const { rows } = await query(`SELECT COALESCE(NULLIF(sku, ''), chassis_number, item_name, id::text) AS code, item_name, make, model FROM vehicles WHERE id = $1 AND company_id = $2`, [id, company_id]);
    if (!rows.length) return res.status(404).send('Not found');
    const buf = await generateQRCodeBuffer(rows[0].code, rows[0].item_name || rows[0].make, rows[0].model);
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    res.status(500).send('Error');
  }
}

async function getVehicleLabelPdf(req, res) {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;
    const { rows } = await query(`
      SELECT v.*, b.name as branch_name 
      FROM vehicles v 
      LEFT JOIN branches b ON b.id = v.branch_id 
      WHERE v.id = $1 AND v.company_id = $2`, [id, company_id]);
    if (!rows.length) return res.status(404).send('Not found');
    
    const { rows: co } = await query(`SELECT name FROM companies WHERE id = $1`, [company_id]);
    
    // We cannot use localhost links for images inside puppeteer reliably, 
    // it's better to render barcode to base64 and inject it for offline rendering.
    const code = rows[0].sku || rows[0].chassis_number || rows[0].item_name;
    const barcodeBuf = await generateBarcodeBuffer(code);
    const qrcodeBuf = await generateQRCodeBuffer(code, rows[0].item_name || rows[0].make, rows[0].model);
    
    const html = generateVehicleLabelHTML(rows[0], co[0], { name: rows[0].branch_name })
      .replace(`http://localhost:4000/api/vehicles/${id}/barcode`, `data:image/png;base64,${barcodeBuf.toString('base64')}`)
      .replace(`http://localhost:4000/api/vehicles/${id}/qrcode`, `data:image/png;base64,${qrcodeBuf.toString('base64')}`);
      
    const pdf = await htmlToPdfBuffer(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="label-${code}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
}

async function batchBarcodesPdf(req, res) {
  try {
    const { ids } = req.query;
    if (!ids) return res.status(400).send('No ids provided');
    const idArray = ids.split(',');
    if (!idArray.length) return res.status(400).send('No ids provided');

    const company_id = req.user.company_id;
    const { rows } = await query(`
      SELECT v.*, b.name as branch_name 
      FROM vehicles v 
      LEFT JOIN branches b ON b.id = v.branch_id 
      WHERE v.id = ANY($1) AND v.company_id = $2`, [idArray, company_id]);
      
    if (!rows.length) return res.status(404).send('Not found');
    
    const { rows: co } = await query(`SELECT name FROM companies WHERE id = $1`, [company_id]);
    
    const htmls = [];
    for (const v of rows) {
      const code = v.sku || v.chassis_number || v.item_name;
      const barcodeBuf = await generateBarcodeBuffer(code);
      const qrcodeBuf = await generateQRCodeBuffer(code, v.item_name || v.make, v.model);
      
      const html = generateVehicleLabelHTML(v, co[0], { name: v.branch_name })
        .replace(`http://localhost:4000/api/vehicles/${v.id}/barcode`, `data:image/png;base64,${barcodeBuf.toString('base64')}`)
        .replace(`http://localhost:4000/api/vehicles/${v.id}/qrcode`, `data:image/png;base64,${qrcodeBuf.toString('base64')}`);
      htmls.push(html);
    }
    
    const batchHtml = generateBatchLabelsHTML(htmls);
    const pdf = await htmlToPdfBuffer(batchHtml);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="labels-batch.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
}

module.exports = {
  listVehicles, createVehicle, getVehicle, updateVehicle,
  transferVehicle, inventorySummary, branchInventory,
  searchVehicles, expiringInsurance, checkSkuAvailable,
  listItemFieldDefinitions, createItemFieldDefinition, deleteItemFieldDefinition,
  getBarcode,
  getQRCode,
  getVehicleLabelPdf,
  batchBarcodesPdf,
};
