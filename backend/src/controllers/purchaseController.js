const { query, getClient } = require('../config/db');
const { isInterstate, calculateGst, getGstRateForHsn } = require('../services/gstService');
const { logAudit } = require('../middleware/auditLog');

function financialYearFromOrderDate(orderDateStr) {
  const [Y, M] = orderDateStr.split('T')[0].split('-').map(Number);
  if (M >= 4) return `${Y}-${String(Y + 1).slice(-2)}`;
  return `${Y - 1}-${String(Y).slice(-2)}`;
}

async function generatePoNumber(client, companyId, branchId, orderDateStr) {
  const fy = financialYearFromOrderDate(orderDateStr);
  const { rows: br } = await client.query(
    `SELECT code, name FROM branches WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [branchId, companyId],
  );
  if (br.length === 0) throw new Error('Invalid branch');
  const raw = (br[0].code || br[0].name || 'BR').toString().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const branchCode = (raw || 'BR').slice(0, 10);
  const prefix = `PO/${branchCode}/${fy}/`;
  const { rows } = await client.query(
    `SELECT po_number FROM purchase_orders
     WHERE company_id = $1 AND branch_id = $2 AND is_deleted = FALSE AND po_number LIKE $3`,
    [companyId, branchId, `${prefix}%`],
  );
  let max = 0;
  for (const r of rows) {
    const suf = r.po_number.slice(prefix.length);
    const n = parseInt(suf, 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

function processItemsForPo(items, companyGstin, supplierGstin, discount, tcsApplicable) {
  const interstate = isInterstate(companyGstin, supplierGstin);
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  const processed = [];

  for (const item of items) {
    const qty = item.quantity || 1;
    const unitPrice = item.unit_price;
    const lineTotal = unitPrice * qty;
    const hsnCode = item.hsn_code || '8703';
    const gstRate = item.gst_rate !== undefined && item.gst_rate !== null
      ? Number(item.gst_rate)
      : getGstRateForHsn(hsnCode);
    const gst = calculateGst(lineTotal, gstRate, interstate);
    const amount = lineTotal + gst.cgst_amount + gst.sgst_amount + gst.igst_amount;
    processed.push({
      vehicle_id: item.vehicle_id || null,
      description: item.description,
      hsn_code: hsnCode,
      quantity: qty,
      unit_price: unitPrice,
      cgst_rate: gst.cgst_rate,
      sgst_rate: gst.sgst_rate,
      igst_rate: gst.igst_rate,
      cgst_amount: gst.cgst_amount,
      sgst_amount: gst.sgst_amount,
      igst_amount: gst.igst_amount,
      amount,
      vehicle_data: item.vehicle_data && typeof item.vehicle_data === 'object' ? item.vehicle_data : null,
    });
    subtotal += lineTotal;
    totalCgst += gst.cgst_amount;
    totalSgst += gst.sgst_amount;
    totalIgst += gst.igst_amount;
  }

  const disc = discount || 0;
  const baseAfterDiscount = subtotal - disc;
  const tcs = tcsApplicable ? Math.round(Math.max(0, baseAfterDiscount) * 0.001) : 0;
  const total = baseAfterDiscount + totalCgst + totalSgst + totalIgst + tcs;

  return {
    processed,
    subtotal,
    discount: disc,
    cgst_amount: totalCgst,
    sgst_amount: totalSgst,
    igst_amount: totalIgst,
    tcs_amount: tcs,
    total,
    interstate,
  };
}

async function insertPoItems(client, poId, processed) {
  for (const p of processed) {
    await client.query(
      `INSERT INTO purchase_order_items
         (purchase_order_id, vehicle_id, description, hsn_code, quantity, unit_price,
          cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, amount, vehicle_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        poId, p.vehicle_id, p.description, p.hsn_code, p.quantity, p.unit_price,
        p.cgst_rate, p.sgst_rate, p.igst_rate, p.cgst_amount, p.sgst_amount, p.igst_amount,
        p.amount, p.vehicle_data || null,
      ],
    );
  }
}

async function qtyReceivedSoFar(client, poItemId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(pri.quantity_received), 0)::int AS q
     FROM purchase_receipt_items pri
     JOIN purchase_receipts pr ON pr.id = pri.purchase_receipt_id
     WHERE pri.purchase_order_item_id = $1`,
    [poItemId],
  );
  return rows[0].q;
}

async function createPurchaseOrder(req, res) {
  const company_id = req.user.company_id;
  const d = req.validated;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: sup } = await client.query(
      `SELECT id, gstin, tcs_applicable FROM suppliers
       WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
      [d.supplier_id, company_id],
    );
    if (sup.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid supplier' });
    }

    const { rows: comp } = await client.query(
      `SELECT gstin FROM companies WHERE id = $1`,
      [company_id],
    );
    const companyGstin = comp[0]?.gstin;

    const orderDate = (d.order_date || new Date().toISOString().split('T')[0]).split('T')[0];
    const poNumber = await generatePoNumber(client, company_id, d.branch_id, orderDate);

    const totals = processItemsForPo(
      d.items,
      companyGstin,
      sup[0].gstin,
      d.discount || 0,
      sup[0].tcs_applicable === true,
    );

    const { rows: poRows } = await client.query(
      `INSERT INTO purchase_orders
         (company_id, branch_id, po_number, supplier_id, order_date, expected_delivery_date,
          status, subtotal, discount, cgst_amount, sgst_amount, igst_amount, tcs_amount, total, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        company_id, d.branch_id, poNumber, d.supplier_id, orderDate,
        d.expected_delivery_date || null,
        totals.subtotal, totals.discount, totals.cgst_amount, totals.sgst_amount,
        totals.igst_amount, totals.tcs_amount, totals.total, d.notes || null, req.user.id,
      ],
    );
    const po = poRows[0];
    await insertPoItems(client, po.id, totals.processed);

    await client.query('COMMIT');
    const full = await fetchFullPurchase(po.id, company_id);
    logAudit({
      companyId: company_id, userId: req.user.id, action: 'create', entity: 'purchase_order',
      entityId: po.id, newValue: { po_number: po.po_number }, req,
    });
    res.status(201).json(full);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listPurchaseOrders(req, res) {
  const company_id = req.user.company_id;
  const { role, branch_id: userBranch } = req.user;
  const {
    status, supplier_id, branch_id, date_from, date_to, page = 1, limit = 50,
  } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

  const conditions = ['po.company_id = $1', 'po.is_deleted = FALSE'];
  const params = [company_id];
  let idx = 2;

  if (role === 'staff' || role === 'branch_manager') {
    conditions.push(`po.branch_id = $${idx++}`);
    params.push(userBranch);
  } else if (branch_id) {
    conditions.push(`po.branch_id = $${idx++}`);
    params.push(branch_id);
  }

  if (status) {
    conditions.push(`po.status = $${idx++}`);
    params.push(status);
  }
  if (supplier_id) {
    conditions.push(`po.supplier_id = $${idx++}`);
    params.push(supplier_id);
  }
  if (date_from) {
    conditions.push(`po.order_date >= $${idx++}`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(`po.order_date <= $${idx++}`);
    params.push(date_to);
  }

  const where = conditions.join(' AND ');
  const countResult = await query(`SELECT COUNT(*) FROM purchase_orders po WHERE ${where}`, params);
  params.push(Number(limit), offset);
  const { rows } = await query(
    `SELECT po.*, s.name AS supplier_name, b.name AS branch_name,
            (SELECT COUNT(*)::int FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS item_count
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN branches b ON b.id = po.branch_id
     WHERE ${where}
     ORDER BY po.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  res.json({
    purchase_orders: rows,
    total: parseInt(countResult.rows[0].count, 10),
    page: Number(page),
    limit: Number(limit),
  });
}

async function fetchFullPurchase(poId, companyId) {
  const { rows: poRows } = await query(
    `SELECT po.*, s.name AS supplier_name, s.gstin AS supplier_gstin, s.phone AS supplier_phone,
            s.email AS supplier_email, s.address AS supplier_address, s.state AS supplier_state,
            s.tcs_applicable AS supplier_tcs_applicable,
            b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone, b.code AS branch_code,
            c.name AS company_name, c.gstin AS company_gstin, c.address AS company_address,
            c.phone AS company_phone, c.email AS company_email, c.logo_url AS company_logo_url
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN branches b ON b.id = po.branch_id
     JOIN companies c ON c.id = po.company_id
     WHERE po.id = $1 AND po.company_id = $2 AND po.is_deleted = FALSE`,
    [poId, companyId],
  );
  if (poRows.length === 0) return null;
  const po = poRows[0];

  const { rows: items } = await query(
    `SELECT poi.*, COALESCE(rsum.q, 0)::int AS qty_received
     FROM purchase_order_items poi
     LEFT JOIN (
       SELECT purchase_order_item_id, SUM(quantity_received)::int AS q
       FROM purchase_receipt_items
       GROUP BY purchase_order_item_id
     ) rsum ON rsum.purchase_order_item_id = poi.id
     WHERE poi.purchase_order_id = $1
     ORDER BY poi.created_at ASC`,
    [poId],
  );

  const { rows: receipts } = await query(
    `SELECT id, received_date, status, notes, created_at
     FROM purchase_receipts WHERE purchase_order_id = $1 ORDER BY created_at DESC`,
    [poId],
  );

  return { purchase_order: po, items, receipts };
}

async function getPurchaseOrder(req, res) {
  const full = await fetchFullPurchase(req.params.id, req.user.company_id);
  if (!full) return res.status(404).json({ error: 'Purchase order not found' });
  res.json(full);
}

async function updatePurchaseOrder(req, res) {
  const company_id = req.user.company_id;
  const poId = req.params.id;
  const d = req.validated;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE FOR UPDATE`,
      [poId, company_id],
    );
    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (existing[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only draft purchase orders can be updated' });
    }

    const supplierId = d.supplier_id || existing[0].supplier_id;
    const branchId = d.branch_id || existing[0].branch_id;
    const existingOd = existing[0].order_date;
    const odStr = d.order_date
      ? String(d.order_date).split('T')[0]
      : (existingOd instanceof Date
        ? existingOd.toISOString().split('T')[0]
        : String(existingOd).split('T')[0]);

    const { rows: sup } = await client.query(
      `SELECT gstin, tcs_applicable FROM suppliers WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
      [supplierId, company_id],
    );
    if (sup.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid supplier' });
    }
    const { rows: comp } = await client.query(`SELECT gstin FROM companies WHERE id = $1`, [company_id]);

    let poNumber = existing[0].po_number;
    if (d.branch_id && d.branch_id !== existing[0].branch_id) {
      poNumber = await generatePoNumber(client, company_id, branchId, odStr);
    } else if (d.order_date && odStr !== existing[0].order_date.toISOString().split('T')[0]) {
      const oldFy = financialYearFromOrderDate(existing[0].order_date.toISOString().split('T')[0]);
      const newFy = financialYearFromOrderDate(odStr);
      if (oldFy !== newFy) {
        poNumber = await generatePoNumber(client, company_id, branchId, odStr);
      }
    }

    const totals = processItemsForPo(
      d.items,
      comp[0]?.gstin,
      sup[0].gstin,
      d.discount ?? Number(existing[0].discount),
      sup[0].tcs_applicable === true,
    );

    await client.query(`DELETE FROM purchase_order_items WHERE purchase_order_id = $1`, [poId]);

    await client.query(
      `UPDATE purchase_orders SET
         branch_id = $2, po_number = $3, supplier_id = $4, order_date = $5, expected_delivery_date = $6,
         subtotal = $7, discount = $8, cgst_amount = $9, sgst_amount = $10, igst_amount = $11,
         tcs_amount = $12, total = $13, notes = $14, updated_at = NOW()
       WHERE id = $1`,
      [
        poId, branchId, poNumber, supplierId, odStr,
        d.expected_delivery_date !== undefined ? d.expected_delivery_date : existing[0].expected_delivery_date,
        totals.subtotal, totals.discount, totals.cgst_amount, totals.sgst_amount, totals.igst_amount,
        totals.tcs_amount, totals.total,
        d.notes !== undefined ? d.notes : existing[0].notes,
      ],
    );

    await insertPoItems(client, poId, totals.processed);
    await client.query('COMMIT');
    const full = await fetchFullPurchase(poId, company_id);
    logAudit({
      companyId: company_id, userId: req.user.id, action: 'update', entity: 'purchase_order',
      entityId: poId, req,
    });
    res.json(full);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function confirmPurchaseOrder(req, res) {
  const company_id = req.user.company_id;
  const poId = req.params.id;
  const { rows } = await query(
    `UPDATE purchase_orders SET status = 'confirmed', updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE AND status = 'draft'
     RETURNING id`,
    [poId, company_id],
  );
  if (rows.length === 0) {
    return res.status(400).json({ error: 'PO not found or not in draft status' });
  }
  logAudit({
    companyId: company_id, userId: req.user.id, action: 'update', entity: 'purchase_order',
    entityId: poId, newValue: { status: 'confirmed' }, req,
  });
  res.json(await fetchFullPurchase(poId, company_id));
}

async function cancelPurchaseOrder(req, res) {
  const company_id = req.user.company_id;
  const poId = req.params.id;
  const { rows } = await query(
    `UPDATE purchase_orders SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE
       AND status IN ('draft', 'confirmed')
     RETURNING id`,
    [poId, company_id],
  );
  if (rows.length === 0) {
    return res.status(400).json({ error: 'PO cannot be cancelled' });
  }
  logAudit({
    companyId: company_id, userId: req.user.id, action: 'update', entity: 'purchase_order',
    entityId: poId, newValue: { status: 'cancelled' }, req,
  });
  res.json(await fetchFullPurchase(poId, company_id));
}

async function receivePurchase(req, res) {
  const company_id = req.user.company_id;
  const poId = req.params.id;
  const { items, received_date, notes } = req.validated;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { rows: poRows } = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE FOR UPDATE`,
      [poId, company_id],
    );
    if (poRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    const po = poRows[0];
    if (po.status !== 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only confirmed POs can be received' });
    }

    const { rows: poItems } = await client.query(
      `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`,
      [poId],
    );
    const itemById = new Map(poItems.map((r) => [r.id, r]));

    const chassisSet = new Set();
    for (const line of items) {
      const vd = line.vehicle_data;
      if (vd && vd.chassis_number) {
        const ch = String(vd.chassis_number).trim();
        if (chassisSet.has(ch)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Duplicate chassis in request: ${ch}` });
        }
        chassisSet.add(ch);
        const { rows: dup } = await client.query(
          `SELECT id FROM vehicles WHERE chassis_number = $1 AND company_id = $2 AND is_deleted = FALSE`,
          [ch, company_id],
        );
        if (dup.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Chassis already exists: ${ch}` });
        }
      }
    }

    for (const line of items) {
      const poi = itemById.get(line.purchase_order_item_id);
      if (!poi) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid purchase_order_item_id' });
      }
      if (line.vehicle_data && line.vehicle_data.chassis_number && Number(line.quantity_received) !== 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'When capturing vehicle data, quantity_received must be 1 per line',
        });
      }
      const prev = await qtyReceivedSoFar(client, line.purchase_order_item_id);
      const maxQty = Number(poi.quantity);
      if (prev + line.quantity_received > maxQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Quantity exceeds ordered for line ${poi.description}`,
          purchase_order_item_id: line.purchase_order_item_id,
          ordered: maxQty,
          already_received: prev,
          attempted: line.quantity_received,
        });
      }
    }

    const recvDate = (received_date || new Date().toISOString().split('T')[0]).split('T')[0];
    const { rows: recRows } = await client.query(
      `INSERT INTO purchase_receipts
         (company_id, purchase_order_id, branch_id, received_date, received_by, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,'partial')
       RETURNING *`,
      [company_id, poId, po.branch_id, recvDate, req.user.id, notes || null],
    );
    const receipt = recRows[0];

    for (const line of items) {
      await client.query(
        `INSERT INTO purchase_receipt_items
           (purchase_receipt_id, purchase_order_item_id, quantity_received, vehicle_data)
         VALUES ($1,$2,$3,$4)`,
        [
          receipt.id, line.purchase_order_item_id, line.quantity_received,
          line.vehicle_data || null,
        ],
      );

      const poi = itemById.get(line.purchase_order_item_id);
      const vd = line.vehicle_data;
      if (vd && vd.chassis_number && vd.engine_number) {
        const purchasePricePaise = vd.purchase_price != null
          ? Math.round(Number(vd.purchase_price))
          : Number(poi.unit_price);
        const sellingPaise = vd.selling_price != null ? Math.round(Number(vd.selling_price)) : 0;
        await client.query(
          `INSERT INTO vehicles
             (company_id, branch_id, chassis_number, engine_number, make, model, variant, color, year,
              purchase_price, selling_price, status, purchase_order_id,
              rto_number, rto_date, insurance_company, insurance_expiry, insurance_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'in_stock',$12,$13,$14,$15,$16,$17)`,
          [
            company_id, po.branch_id,
            String(vd.chassis_number).trim(), String(vd.engine_number).trim(),
            vd.make || null, vd.model || null, vd.variant || null, vd.color || null,
            vd.year != null ? parseInt(vd.year, 10) : null,
            purchasePricePaise, sellingPaise, poId,
            vd.rto_number || null, vd.rto_date || null, vd.insurance_company || null,
            vd.insurance_expiry || null, vd.insurance_number || null,
          ],
        );
      }
    }

    let allComplete = true;
    for (const poi of poItems) {
      const prev = await qtyReceivedSoFar(client, poi.id);
      if (prev < Number(poi.quantity)) {
        allComplete = false;
        break;
      }
    }

    await client.query(
      `UPDATE purchase_receipts SET status = $2 WHERE id = $1`,
      [receipt.id, allComplete ? 'complete' : 'partial'],
    );

    if (allComplete) {
      await client.query(
        `UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = $1`,
        [poId],
      );
    }

    await client.query('COMMIT');
    logAudit({
      companyId: company_id, userId: req.user.id, action: 'create', entity: 'purchase_receipt',
      entityId: receipt.id, newValue: { purchase_order_id: poId }, req,
    });

    const { rows: recItems } = await query(
      `SELECT * FROM purchase_receipt_items WHERE purchase_receipt_id = $1`,
      [receipt.id],
    );
    res.status(201).json({ receipt, items: recItems, purchase_order: (await fetchFullPurchase(poId, company_id)).purchase_order });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listReceiptsForPo(req, res) {
  const company_id = req.user.company_id;
  const poId = req.params.id;
  const poCheck = await query(
    `SELECT id FROM purchase_orders WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [poId, company_id],
  );
  if (poCheck.rows.length === 0) return res.status(404).json({ error: 'Purchase order not found' });

  const { rows: receipts } = await query(
    `SELECT pr.*, u.name AS received_by_name
     FROM purchase_receipts pr
     LEFT JOIN users u ON u.id = pr.received_by
     WHERE pr.purchase_order_id = $1
     ORDER BY pr.created_at DESC`,
    [poId],
  );

  const out = [];
  for (const r of receipts) {
    const { rows: items } = await query(
      `SELECT pri.*, poi.description AS line_description
       FROM purchase_receipt_items pri
       JOIN purchase_order_items poi ON poi.id = pri.purchase_order_item_id
       WHERE pri.purchase_receipt_id = $1`,
      [r.id],
    );
    out.push({ ...r, items });
  }
  res.json({ receipts: out });
}

async function listAllReceipts(req, res) {
  const company_id = req.user.company_id;
  const { role, branch_id: userBranch } = req.user;
  const { branch_id, date_from, date_to, page = 1, limit = 50 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

  const conditions = ['pr.company_id = $1'];
  const params = [company_id];
  let idx = 2;

  if (role === 'staff' || role === 'branch_manager') {
    conditions.push(`pr.branch_id = $${idx++}`);
    params.push(userBranch);
  } else if (branch_id) {
    conditions.push(`pr.branch_id = $${idx++}`);
    params.push(branch_id);
  }
  if (date_from) {
    conditions.push(`pr.received_date >= $${idx++}`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(`pr.received_date <= $${idx++}`);
    params.push(date_to);
  }

  const where = conditions.join(' AND ');
  const countResult = await query(
    `SELECT COUNT(*) FROM purchase_receipts pr WHERE ${where}`,
    params,
  );
  params.push(Number(limit), offset);
  const { rows } = await query(
    `SELECT pr.*, po.po_number, s.name AS supplier_name, b.name AS branch_name
     FROM purchase_receipts pr
     JOIN purchase_orders po ON po.id = pr.purchase_order_id
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN branches b ON b.id = pr.branch_id
     WHERE ${where}
     ORDER BY pr.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  res.json({
    receipts: rows,
    total: parseInt(countResult.rows[0].count, 10),
    page: Number(page),
    limit: Number(limit),
  });
}

module.exports = {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchase,
  listReceiptsForPo,
  listAllReceipts,
  fetchFullPurchase,
  financialYearFromOrderDate,
  generatePoNumber,
  processItemsForPo,
  insertPoItems,
};
