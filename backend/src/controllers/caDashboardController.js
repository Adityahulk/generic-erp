const { query } = require('../config/db');

function monthRange(y, m) {
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const endM = m === 12 ? 1 : m + 1;
  const endY = m === 12 ? y + 1 : y;
  const endExclusive = `${endY}-${String(endM).padStart(2, '0')}-01`;
  return { start, endExclusive };
}

function prevMonth(y, m) {
  if (m <= 1) return { y: y - 1, m: 12 };
  return { y, m: m - 1 };
}

/** Indian FY: Apr 1 → Mar 31 */
function financialYearBounds(ref = new Date()) {
  const y = ref.getFullYear();
  const month = ref.getMonth() + 1;
  const startYear = month >= 4 ? y : y - 1;
  const endYear = startYear + 1;
  return {
    start: `${startYear}-04-01`,
    endInclusive: `${endYear}-03-31`,
  };
}

async function monthMetrics(companyId, y, m) {
  const { start, endExclusive } = monthRange(y, m);

  const [salesRes, purchRes, expRes] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total), 0)::bigint AS total_sales,
              COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0)::bigint AS gst_collected
       FROM invoices
       WHERE company_id = $1 AND status = 'confirmed' AND is_deleted = FALSE
         AND invoice_date >= $2::date AND invoice_date < $3::date`,
      [companyId, start, endExclusive],
    ),
    query(
      `SELECT COALESCE(SUM(total), 0)::bigint AS total_purchases,
              COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0)::bigint AS gst_paid
       FROM purchase_orders
       WHERE company_id = $1 AND is_deleted = FALSE AND status <> 'cancelled'
         AND order_date >= $2::date AND order_date < $3::date`,
      [companyId, start, endExclusive],
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS total_expenses
       FROM expenses
       WHERE company_id = $1 AND is_deleted = FALSE
         AND expense_date >= $2::date AND expense_date < $3::date`,
      [companyId, start, endExclusive],
    ),
  ]);

  const total_sales = Number(salesRes.rows[0].total_sales);
  const total_purchases = Number(purchRes.rows[0].total_purchases);
  const total_expenses = Number(expRes.rows[0].total_expenses);
  const total_gst_collected = Number(salesRes.rows[0].gst_collected);
  const total_gst_paid = Number(purchRes.rows[0].gst_paid);

  return {
    total_sales,
    total_purchases,
    gross_profit: total_sales - total_purchases - total_expenses,
    total_gst_collected,
    total_gst_paid,
    net_gst_liability: total_gst_collected - total_gst_paid,
    total_expenses,
  };
}

async function gstr1MonthSummary(companyId, y, m) {
  const { start, endExclusive } = monthRange(y, m);
  const { rows: invs } = await query(
    `SELECT subtotal, discount, cgst_amount, sgst_amount, igst_amount, total, customer_id,
            c.gstin AS customer_gstin
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.company_id = $1 AND i.status = 'confirmed' AND i.is_deleted = FALSE
       AND i.invoice_date >= $2::date AND i.invoice_date < $3::date`,
    [companyId, start, endExclusive],
  );

  let b2b = 0;
  let b2c = 0;
  let taxable = 0;
  let tax = 0;

  for (const inv of invs) {
    const tv = Number(inv.subtotal) - Number(inv.discount || 0);
    const t = Number(inv.cgst_amount) + Number(inv.sgst_amount) + Number(inv.igst_amount);
    taxable += tv;
    tax += t;
    const hasGstin = inv.customer_gstin && String(inv.customer_gstin).length >= 15;
    if (hasGstin) b2b += 1;
    else b2c += 1;
  }

  return {
    month: m,
    year: y,
    invoice_count: invs.length,
    b2b_count: b2b,
    b2c_count: b2c,
    total_taxable_value: taxable,
    total_tax: tax,
  };
}

async function caDashboard(req, res) {
  try {
    const company_id = req.user.company_id;
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    const { y: py, m: pm } = prevMonth(cy, cm);

    const [current_month, previous_month] = await Promise.all([
      monthMetrics(company_id, cy, cm),
      monthMetrics(company_id, py, pm),
    ]);

    const fy = financialYearBounds(now);
    const [fySales, fyPurch, fyGst, fyExp] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(total), 0)::bigint AS v
         FROM invoices WHERE company_id = $1 AND status = 'confirmed' AND is_deleted = FALSE
           AND invoice_date >= $2::date AND invoice_date <= $3::date`,
        [company_id, fy.start, fy.endInclusive],
      ),
      query(
        `SELECT COALESCE(SUM(total), 0)::bigint AS v
         FROM purchase_orders WHERE company_id = $1 AND is_deleted = FALSE AND status <> 'cancelled'
           AND order_date >= $2::date AND order_date <= $3::date`,
        [company_id, fy.start, fy.endInclusive],
      ),
      query(
        `SELECT COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0)::bigint AS v
         FROM invoices WHERE company_id = $1 AND status = 'confirmed' AND is_deleted = FALSE
           AND invoice_date >= $2::date AND invoice_date <= $3::date`,
        [company_id, fy.start, fy.endInclusive],
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::bigint AS v
         FROM expenses WHERE company_id = $1 AND is_deleted = FALSE
           AND expense_date >= $2::date AND expense_date <= $3::date`,
        [company_id, fy.start, fy.endInclusive],
      ),
    ]);

    const this_fy = {
      total_sales: Number(fySales.rows[0].v),
      total_purchases: Number(fyPurch.rows[0].v),
      total_gst_collected: Number(fyGst.rows[0].v),
      total_expenses: Number(fyExp.rows[0].v),
    };

    const pending_gstr1 = [];
    let y0 = cy;
    let m0 = cm;
    for (let i = 0; i < 3; i += 1) {
      pending_gstr1.push(await gstr1MonthSummary(company_id, y0, m0));
      const p = prevMonth(y0, m0);
      y0 = p.y;
      m0 = p.m;
    }

    const overdueRes = await query(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(SUM(loan_amount), 0)::bigint AS total_loan,
              COALESCE(SUM(penalty_per_day * GREATEST(0, (CURRENT_DATE - due_date))), 0)::bigint AS penalty
       FROM loans
       WHERE company_id = $1 AND is_deleted = FALSE AND status = 'active' AND due_date < CURRENT_DATE`,
      [company_id],
    );

    const overdue_loans = {
      count: Number(overdueRes.rows[0].cnt),
      total_overdue_amount: Number(overdueRes.rows[0].total_loan),
      total_penalty_accrued: Number(overdueRes.rows[0].penalty),
    };

    const { start: curStart, endExclusive: curEnd } = monthRange(cy, cm);

    const catRes = await query(
      `SELECT category, COALESCE(SUM(amount), 0)::bigint AS total
       FROM expenses
       WHERE company_id = $1 AND is_deleted = FALSE
         AND expense_date >= $2::date AND expense_date < $3::date
       GROUP BY category
       ORDER BY total DESC`,
      [company_id, curStart, curEnd],
    );

    const expense_by_category_this_month = catRes.rows.map((r) => ({
      category: r.category,
      total: Number(r.total),
    }));

    const topExp = await query(
      `SELECT id, category, description, amount, expense_date, branch_id, created_at
       FROM expenses
       WHERE company_id = $1 AND is_deleted = FALSE
         AND expense_date >= $2::date AND expense_date < $3::date
       ORDER BY amount DESC, expense_date DESC
       LIMIT 10`,
      [company_id, curStart, curEnd],
    );

    const largeTx = await query(
      `SELECT * FROM (
         SELECT 'sale' AS type, i.total AS amount, i.invoice_number AS reference,
                i.invoice_date::text AS txn_date, i.id::text AS source_id
         FROM invoices i
         WHERE i.company_id = $1 AND i.is_deleted = FALSE AND i.status = 'confirmed'
           AND i.invoice_date >= $2::date AND i.invoice_date < $3::date
         UNION ALL
         SELECT 'purchase' AS type, po.total AS amount, po.po_number AS reference,
                po.order_date::text AS txn_date, po.id::text AS source_id
         FROM purchase_orders po
         WHERE po.company_id = $1 AND po.is_deleted = FALSE AND po.status <> 'cancelled'
           AND po.order_date >= $2::date AND po.order_date < $3::date
       ) x
       ORDER BY x.amount DESC
       LIMIT 10`,
      [company_id, curStart, curEnd],
    );

    res.json({
      current_month,
      previous_month,
      this_fy,
      pending_gstr1,
      overdue_loans,
      expense_by_category_this_month,
      top_expenses_this_month: topExp.rows,
      recent_large_transactions: largeTx.rows,
    });
  } catch (err) {
    console.error('caDashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load CA dashboard' });
  }
}

module.exports = { caDashboard };
