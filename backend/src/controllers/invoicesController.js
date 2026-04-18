const { query, getClient } = require('../config/db');
const { isInterstate, calculateGst, getGstRateForHsn } = require('../services/gstService');
const { logAudit } = require('../middleware/auditLog');

async function generateInvoiceNumber(client, companyId, branchId) {
  const year = new Date().getFullYear();

  // Get branch code (first 3 chars uppercase)
  const { rows: brRows } = await client.query(
    `SELECT name FROM branches WHERE id = $1`,
    [branchId],
  );
  const branchCode = (brRows[0]?.name || 'GEN').substring(0, 3).toUpperCase();

  // Get next sequence for this company+year
  const { rows: seqRows } = await client.query(
    `SELECT COUNT(*)::int + 1 AS seq FROM invoices
     WHERE company_id = $1 AND invoice_number LIKE $2`,
    [companyId, `INV-${year}-${branchCode}-%`],
  );
  const seq = String(seqRows[0].seq).padStart(4, '0');

  return `INV-${year}-${branchCode}-${seq}`;
}

/**
 * Insert invoice + line items inside an open transaction.
 * @param {import('pg').PoolClient} client
 * @param {string} company_id
 * @param {string} branch_id - branch for invoice numbering and FK
 * @param {object} data - same shape as validated create invoice body
 * @returns {Promise<object>} invoice row
 */
async function insertInvoiceWithItems(client, company_id, branch_id, data) {
  let customerId = data.customer_id;
  if (!customerId && data.customer) {
    const { rows: newCust } = await client.query(
      `INSERT INTO customers (company_id, name, phone, email, address, gstin)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, gstin`,
      [company_id, data.customer.name, data.customer.phone || null,
        data.customer.email || null, data.customer.address || null,
        data.customer.gstin || null],
    );
    customerId = newCust[0].id;
  }
  if (!customerId) {
    const err = new Error('Customer required');
    err.statusCode = 400;
    throw err;
  }

  const { rows: custRows } = await client.query(
    `SELECT gstin FROM customers WHERE id = $1 AND company_id = $2`,
    [customerId, company_id],
  );
  const customerGstin = custRows[0]?.gstin;

  const { rows: compRows } = await client.query(
    `SELECT gstin FROM companies WHERE id = $1`,
    [company_id],
  );
  const companyGstin = compRows[0]?.gstin;

  const interstate = isInterstate(companyGstin, customerGstin);

  const requestedVehicleIds = [...new Set(
    [data.vehicle_id, ...data.items.map((item) => item.vehicle_id)].filter(Boolean),
  )];
  const vehicleMap = new Map();
  for (const vehicleId of requestedVehicleIds) {
    const { rows: vRows } = await client.query(
      `SELECT id, item_name, sku, selling_price, hsn_code, default_gst_rate, unit_of_measure,
              quantity_in_stock, is_serialized, status
       FROM vehicles
       WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE FOR UPDATE`,
      [vehicleId, company_id],
    );
    if (vRows.length === 0) {
      const err = new Error('Item not found');
      err.statusCode = 404;
      throw err;
    }
    const vehicle = vRows[0];
    if (vehicle.status !== 'in_stock' && !(vehicle.is_serialized === false && Number(vehicle.quantity_in_stock) > 0)) {
      const err = new Error('Item is not available for sale');
      err.statusCode = 400;
      throw err;
    }
    vehicleMap.set(vehicleId, vehicle);
  }

  const invoiceNumber = await generateInvoiceNumber(client, company_id, branch_id);

  let invoiceVehicleId = data.vehicle_id || null;
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  const processedItems = [];

  for (const item of data.items) {
    const linkedItem = item.vehicle_id ? vehicleMap.get(item.vehicle_id) : null;
    const qty = item.quantity || 1;
    if (linkedItem?.is_serialized && qty !== 1) {
      const err = new Error('Serialized items can only be invoiced one at a time');
      err.statusCode = 400;
      throw err;
    }
    if (linkedItem && linkedItem.is_serialized === false && qty > Number(linkedItem.quantity_in_stock)) {
      const err = new Error(`Insufficient stock. Available: ${linkedItem.quantity_in_stock} ${linkedItem.unit_of_measure}`);
      err.statusCode = 400;
      throw err;
    }
    const unitPrice = item.unit_price ?? linkedItem?.selling_price ?? 0;
    const lineTotal = unitPrice * qty;
    const hsnCode = item.hsn_code || linkedItem?.hsn_code || '';
    const gstRate = item.gst_rate !== undefined
      ? item.gst_rate
      : linkedItem?.default_gst_rate ?? getGstRateForHsn(hsnCode);
    const description = item.description || linkedItem?.item_name || 'Item';

    const gst = calculateGst(lineTotal, gstRate, interstate);

    const amount = lineTotal + gst.cgst_amount + gst.sgst_amount + gst.igst_amount;

    processedItems.push({
      vehicle_id: item.vehicle_id || null,
      description,
      hsn_code: hsnCode,
      quantity: qty,
      unit_price: unitPrice,
      ...gst,
      amount,
    });
    if (!invoiceVehicleId && item.vehicle_id) invoiceVehicleId = item.vehicle_id;

    subtotal += lineTotal;
    totalCgst += gst.cgst_amount;
    totalSgst += gst.sgst_amount;
    totalIgst += gst.igst_amount;
  }

  const discount = data.discount || 0;
  const total = subtotal - discount + totalCgst + totalSgst + totalIgst;

  const { rows: invRows } = await client.query(
      `INSERT INTO invoices
       (company_id, branch_id, invoice_number, invoice_date, customer_id, vehicle_id,
        subtotal, discount, cgst_amount, sgst_amount, igst_amount, total, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      company_id, branch_id, invoiceNumber, data.invoice_date || new Date().toISOString().split('T')[0],
      customerId, invoiceVehicleId,
      subtotal, discount, totalCgst, totalSgst, totalIgst, total,
      data.status || 'draft', data.notes || null,
    ],
  );

  const invoice = invRows[0];

  for (const item of processedItems) {
    await client.query(
      `INSERT INTO invoice_items
         (invoice_id, company_id, vehicle_id, description, hsn_code, quantity, unit_price,
          cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        invoice.id, company_id, item.vehicle_id, item.description, item.hsn_code, item.quantity,
        item.unit_price, item.cgst_rate, item.sgst_rate, item.igst_rate,
        item.cgst_amount, item.sgst_amount, item.igst_amount, item.amount,
      ],
    );
  }

  if (data.status === 'confirmed') {
    for (const item of processedItems) {
      if (!item.vehicle_id) continue;
      const linkedItem = vehicleMap.get(item.vehicle_id);
      if (!linkedItem) continue;
      if (linkedItem.is_serialized) {
        await client.query(
          `UPDATE vehicles SET status = 'sold', quantity_in_stock = 0 WHERE id = $1 AND company_id = $2`,
          [item.vehicle_id, company_id],
        );
      } else {
        await client.query(
          `UPDATE vehicles
           SET quantity_in_stock = quantity_in_stock - $1,
               status = CASE WHEN quantity_in_stock - $1 <= 0 THEN 'sold' ELSE 'in_stock' END
           WHERE id = $2 AND company_id = $3`,
          [item.quantity, item.vehicle_id, company_id],
        );
      }
    }
  }

  return invoice;
}

async function createInvoice(req, res) {
  const company_id = req.user.company_id;
  const branch_id = req.user.branch_id;
  const data = req.validated;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const invoice = await insertInvoiceWithItems(client, company_id, branch_id, data);
    await client.query('COMMIT');

    const result = await fetchFullInvoice(invoice.id, company_id);
    logAudit({
      companyId: company_id, userId: req.user.id, action: 'create', entity: 'invoice',
      entityId: invoice.id, newValue: { invoice_number: invoice.invoice_number, total: invoice.total }, req,
    });
    res.status(201).json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listInvoices(req, res) {
  const company_id = req.user.company_id;
  const { role, branch_id: userBranch } = req.user;
  const { branch_id, status, customer_search, date_from, date_to, page = 1, limit = 50 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

  const conditions = ['i.company_id = $1', 'i.is_deleted = FALSE'];
  const params = [company_id];
  let idx = 2;

  if (role === 'staff' || role === 'branch_manager') {
    conditions.push(`i.branch_id = $${idx++}`);
    params.push(userBranch);
  } else if (branch_id) {
    conditions.push(`i.branch_id = $${idx++}`);
    params.push(branch_id);
  }

  if (status) {
    conditions.push(`i.status = $${idx++}`);
    params.push(status);
  }

  if (date_from) {
    conditions.push(`i.invoice_date >= $${idx++}`);
    params.push(date_from);
  }

  if (date_to) {
    conditions.push(`i.invoice_date <= $${idx++}`);
    params.push(date_to);
  }

  if (customer_search) {
    conditions.push(`(c.name ILIKE $${idx} OR c.phone ILIKE $${idx})`);
    params.push(`%${customer_search}%`);
    idx++;
  }

  const where = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE ${where}`,
    params,
  );

  params.push(Number(limit), offset);
  const { rows } = await query(
    `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone,
            b.name AS branch_name,
            COALESCE(v.item_name, CONCAT_WS(' ', v.make, v.model, v.variant)) AS item_name,
            COALESCE(v.sku, v.chassis_number) AS sku
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN branches b ON b.id = i.branch_id
     LEFT JOIN vehicles v ON v.id = i.vehicle_id
     WHERE ${where}
     ORDER BY i.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  res.json({
    invoices: rows,
    total: parseInt(countResult.rows[0].count, 10),
    page: Number(page),
    limit: Number(limit),
  });
}

async function getInvoice(req, res) {
  const { id } = req.params;
  const company_id = req.user.company_id;
  const result = await fetchFullInvoice(id, company_id);
  if (!result) return res.status(404).json({ error: 'Invoice not found' });
  res.json(result);
}

async function cancelInvoice(req, res) {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, status, vehicle_id FROM invoices
       WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE FOR UPDATE`,
      [id, company_id],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const inv = rows[0];
    if (inv.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invoice is already cancelled' });
    }

    if (inv.status === 'confirmed') {
      const { rows: lineItems } = await client.query(
        `SELECT ii.vehicle_id, ii.quantity, v.is_serialized
         FROM invoice_items ii
         LEFT JOIN vehicles v ON v.id = ii.vehicle_id
         WHERE ii.invoice_id = $1 AND ii.is_deleted = FALSE AND ii.vehicle_id IS NOT NULL`,
        [id],
      );
      for (const item of lineItems) {
        if (item.is_serialized) {
          await client.query(
            `UPDATE vehicles SET status = 'in_stock', quantity_in_stock = 1 WHERE id = $1 AND company_id = $2`,
            [item.vehicle_id, company_id],
          );
        } else {
          await client.query(
            `UPDATE vehicles
             SET quantity_in_stock = quantity_in_stock + $1,
                 status = 'in_stock'
             WHERE id = $2 AND company_id = $3`,
            [item.quantity, item.vehicle_id, company_id],
          );
        }
      }
    }

    await client.query(
      `UPDATE invoices SET status = 'cancelled' WHERE id = $1`,
      [id],
    );

    await client.query('COMMIT');
    logAudit({ companyId: company_id, userId: req.user.id, action: 'update', entity: 'invoice', entityId: id, oldValue: { status: 'confirmed' }, newValue: { status: 'cancelled' }, req });
    res.json({ message: 'Invoice cancelled', invoice_id: id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function confirmInvoice(req, res) {
  const { id } = req.params;
  const company_id = req.user.company_id;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, status, vehicle_id FROM invoices
       WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE FOR UPDATE`,
      [id, company_id],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only draft invoices can be confirmed' });
    }

    const { rows: lineItems } = await client.query(
      `SELECT ii.vehicle_id, ii.quantity, v.status, v.quantity_in_stock, v.is_serialized, v.unit_of_measure
       FROM invoice_items ii
       LEFT JOIN vehicles v ON v.id = ii.vehicle_id
       WHERE ii.invoice_id = $1 AND ii.is_deleted = FALSE AND ii.vehicle_id IS NOT NULL
       FOR UPDATE OF v`,
      [id],
    );

    for (const item of lineItems) {
      if (item.is_serialized) {
        if (item.status !== 'in_stock') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'One of the selected items is no longer available' });
        }
        await client.query(
          `UPDATE vehicles SET status = 'sold', quantity_in_stock = 0 WHERE id = $1`,
          [item.vehicle_id],
        );
      } else if (Number(item.quantity) > Number(item.quantity_in_stock)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock. Available: ${item.quantity_in_stock} ${item.unit_of_measure}` });
      } else {
        await client.query(
          `UPDATE vehicles
           SET quantity_in_stock = quantity_in_stock - $1,
               status = CASE WHEN quantity_in_stock - $1 <= 0 THEN 'sold' ELSE 'in_stock' END
           WHERE id = $2`,
          [item.quantity, item.vehicle_id],
        );
      }
    }

    await client.query(
      `UPDATE invoices SET status = 'confirmed' WHERE id = $1`,
      [id],
    );

    await client.query('COMMIT');

    const result = await fetchFullInvoice(id, company_id);
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Shared helper
async function fetchFullInvoice(invoiceId, companyId) {
  const { rows } = await query(
    `SELECT i.*,
            c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
            c.address AS customer_address, c.gstin AS customer_gstin,
            b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone,
            co.name AS company_name, co.gstin AS company_gstin, co.address AS company_address,
            co.phone AS company_phone, co.email AS company_email,
            co.logo_url, co.signature_url,
            v.item_name, v.sku, v.category, v.brand, v.unit_of_measure, v.quantity_in_stock,
            v.is_serialized, v.hsn_code AS item_hsn_code, v.default_gst_rate AS item_default_gst_rate,
            v.custom_fields, v.notes AS item_notes,
            v.chassis_number, v.engine_number, v.make AS vehicle_make, v.model AS vehicle_model,
            v.variant AS vehicle_variant, v.color AS vehicle_color, v.year AS vehicle_year,
            lo.bank_name AS loan_bank_name, lo.loan_amount AS loan_amount,
            lo.emi_amount AS loan_emi_amount, lo.tenure_months AS loan_tenure_months,
            lo.disbursement_date AS loan_disbursement_date, lo.due_date AS loan_due_date
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN branches b ON b.id = i.branch_id
     LEFT JOIN companies co ON co.id = i.company_id
     LEFT JOIN vehicles v ON v.id = i.vehicle_id
     LEFT JOIN LATERAL (
       SELECT l2.bank_name, l2.loan_amount, l2.emi_amount, l2.tenure_months, l2.disbursement_date, l2.due_date
       FROM loans l2
       WHERE l2.invoice_id = i.id AND l2.company_id = i.company_id AND l2.is_deleted = FALSE
       ORDER BY l2.created_at DESC
       LIMIT 1
     ) lo ON TRUE
     WHERE i.id = $1 AND i.company_id = $2 AND i.is_deleted = FALSE`,
    [invoiceId, companyId],
  );

  if (rows.length === 0) return null;

  const { rows: items } = await query(
    `SELECT ii.*, v.item_name, v.sku, v.category, v.brand, v.unit_of_measure, v.quantity_in_stock,
            v.is_serialized, v.custom_fields, v.chassis_number, v.engine_number, v.make, v.model, v.variant
     FROM invoice_items ii
     LEFT JOIN vehicles v ON v.id = ii.vehicle_id
     WHERE ii.invoice_id = $1 AND ii.is_deleted = FALSE
     ORDER BY ii.created_at`,
    [invoiceId],
  );

  return { invoice: rows[0], items };
}

module.exports = {
  createInvoice,
  insertInvoiceWithItems,
  listInvoices,
  getInvoice,
  cancelInvoice,
  confirmInvoice,
  fetchFullInvoice,
};
