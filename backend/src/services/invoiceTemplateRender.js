const fs = require('fs');
const path = require('path');
const { query } = require('../config/db');
const { DEFAULT_LAYOUT } = require('../constants/invoiceLayoutDefaults');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'invoice-html');
const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');

function mergeLayout(templateRow) {
  const raw = templateRow?.layout_config;
  const cfg = typeof raw === 'object' && raw && !Array.isArray(raw) ? raw : {};
  return { ...DEFAULT_LAYOUT, ...cfg };
}

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPaise(paise) {
  return (Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fileToDataUri(absPath) {
  if (!absPath || !fs.existsSync(absPath)) return '';
  const ext = path.extname(absPath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
  const b64 = fs.readFileSync(absPath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

function findCompanyAsset(companyId, kind) {
  const sub = kind === 'logo' ? 'logos' : 'signatures';
  const dir = path.join(UPLOADS_ROOT, sub, companyId);
  if (!fs.existsSync(dir)) return null;
  const prefix = kind === 'logo' ? 'logo' : 'signature';
  const files = fs.readdirSync(dir);
  const hit = files.find((f) => f.startsWith(`${prefix}.`));
  return hit ? path.join(dir, hit) : null;
}

function tryLegacyUploadUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const rel = url.replace(/^\/+/, '').replace(/^uploads\/?/, '');
  const abs = path.join(UPLOADS_ROOT, rel);
  const normalized = path.normalize(abs);
  if (!normalized.startsWith(path.normalize(UPLOADS_ROOT))) return null;
  return fs.existsSync(normalized) ? normalized : null;
}

function resolveLogoSignatureDataUri(companyId, invoice, layout) {
  let logo = '';
  let signature = '';
  if (layout.show_logo) {
    const p = findCompanyAsset(companyId, 'logo') || tryLegacyUploadUrl(invoice.logo_url);
    logo = p ? fileToDataUri(p) : '';
  }
  if (layout.show_signature) {
    const p = findCompanyAsset(companyId, 'signature') || tryLegacyUploadUrl(invoice.signature_url);
    signature = p ? fileToDataUri(p) : '';
  }
  return { logo, signature };
}

async function fetchInvoiceTemplateRow(companyId, templateId) {
  if (templateId) {
    const { rows } = await query(
      `SELECT * FROM invoice_templates WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
      [templateId, companyId],
    );
    if (rows[0]) return rows[0];
  }
  const { rows } = await query(
    `SELECT * FROM invoice_templates WHERE company_id = $1 AND is_default = TRUE AND is_deleted = FALSE LIMIT 1`,
    [companyId],
  );
  return rows[0] || { template_key: 'standard', layout_config: {} };
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n) {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : '');
}

function belowThousand(n) {
  if (n < 100) return belowHundred(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${ones[h]} Hundred${r ? ` ${belowHundred(r)}` : ''}`.trim();
}

function indianNumberWords(n) {
  if (n === 0) return 'Zero';
  let num = Math.floor(Math.abs(n));
  const parts = [];
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  if (crore) parts.push(`${belowHundred(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (num) parts.push(belowThousand(num));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function amountInWordsFromPaise(paise) {
  const p = Number(paise);
  const rupees = Math.floor(p / 100);
  const ps = Math.round(p % 100);
  let w = `Rupees ${indianNumberWords(rupees)}`;
  if (ps > 0) w += ` and ${belowHundred(ps)} Paise`;
  w += ' Only';
  return w;
}

function buildHeaderHtml(inv, L, logoBlock) {
  const style = L.header_style || 'left-aligned';
  const coBlock = `
    <div class="company-block">
      <div class="company-name">${esc(inv.company_name)}</div>
      <p>${esc(inv.company_address || '')}</p>
      <p>Phone: ${esc(inv.company_phone || '')} | Email: ${esc(inv.company_email || '')}</p>
      <p><strong>GSTIN:</strong> ${esc(inv.company_gstin || '—')}</p>
    </div>`;
  const metaBlock = `
    <div class="header-invoice-meta">
      <div class="title-tax">${inv.irn ? 'e-TAX INVOICE' : 'TAX INVOICE'}</div>
      <table class="meta-table" style="margin-left:auto">
        <tr><td><strong>Invoice No.</strong></td><td>${esc(inv.invoice_number)}</td></tr>
        <tr><td><strong>Invoice Date</strong></td><td>${formatDate(inv.invoice_date)}</td></tr>
        <tr><td><strong>Due Date</strong></td><td>${formatDate(inv.loan_due_date || inv.invoice_date)}</td></tr>
        <tr><td><strong>Status</strong></td><td>${esc(String(inv.status || '').toUpperCase())}</td></tr>
      </table>
    </div>`;

  if (style === 'centered') {
    return `<div class="header-centered" style="text-align:center;margin-bottom:8px">
      ${logoBlock}
      ${coBlock.replace('class="company-block"', 'class="company-block" style="text-align:center"')}
      <div style="margin-top:14px;text-align:center">${metaBlock.replace('margin-left:auto', 'margin:0 auto')}</div>
    </div>`;
  }
  const left = `<div class="header-main" style="flex:1;min-width:0">${logoBlock}${coBlock}</div>`;
  const right = metaBlock.replace('class="header-invoice-meta"', 'class="header-invoice-meta" style="flex:0 0 230px;text-align:right"');
  if (style === 'two-column') {
    return `<div class="header-two-col" style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px">${left}${right}</div>`;
  }
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;width:100%">${left}${right}</div>`;
}

function buildStandardInvoiceHtml({ invoice: inv, items }, templateRow) {
  const L = mergeLayout(templateRow);
  const key = templateRow?.template_key === 'simple' ? 'simple' : 'standard';
  const tplPath = path.join(TEMPLATE_DIR, key === 'simple' ? 'template_simple.html' : 'template_standard.html');
  let html = fs.readFileSync(tplPath, 'utf8');

  const companyId = inv.company_id;
  const { logo, signature } = resolveLogoSignatureDataUri(companyId, inv, L);
  const hasIgst = items.some((i) => Number(i.igst_amount) > 0);
  const font = L.font === 'serif' ? "Georgia, 'Times New Roman', serif" : "'Segoe UI', system-ui, sans-serif";

  const logoBlock = logo
    ? `<img src="${logo}" alt="Logo" style="max-height:52px;margin-bottom:8px;display:block;" />`
    : '';

  const itemDetails = items
    .filter((item) => item.item_name || item.sku || (item.custom_fields && Object.keys(item.custom_fields).length))
    .map((item) => {
      const details = item.custom_fields && typeof item.custom_fields === 'object'
        ? Object.entries(item.custom_fields)
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => `${esc(key.replace(/_/g, ' '))}: ${esc(value)}`)
          .join(' · ')
        : '';
      return `<div style="margin-bottom:8px">
        <p><strong>${esc(item.item_name || item.description)}</strong></p>
        ${item.sku ? `<p style="font-family:monospace;color:#475569">${esc(item.sku)}</p>` : ''}
        ${details ? `<p>${details}</p>` : ''}
      </div>`;
    }).join('');

  const vehicleInner = (L.show_vehicle_details_block !== false) && itemDetails
    ? `<div class="party"><h4>Item Details</h4>${itemDetails}</div>`
    : '<div></div>';

  const vehicleSimple = (L.show_vehicle_details_block !== false) && itemDetails
    ? `<div class="sub"><strong>Item Details:</strong> ${esc(items[0]?.item_name || items[0]?.description || 'Item')}</div>`
    : '';

  let itemsHead;
  let itemsBody;
  let itemsHeadSimple;
  let itemsBodySimple;

  if (key === 'standard') {
    itemsHead = hasIgst
      ? `<tr><th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th class="num">Unit Price</th><th class="num">Disc.</th><th class="num">Taxable</th><th class="num">GST%</th><th class="num">IGST</th><th class="num">Total</th></tr>`
      : `<tr><th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th class="num">Unit Price</th><th class="num">Disc.</th><th class="num">Taxable</th><th class="num">GST%</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Total</th></tr>`;

    itemsBody = items.map((item, idx) => {
      const gstRate = hasIgst ? Number(item.igst_rate) : Number(item.cgst_rate) + Number(item.sgst_rate);
      const taxable = Number(item.amount) - Number(item.cgst_amount) - Number(item.sgst_amount) - Number(item.igst_amount);
      const disc = 0;
      const taxCol = hasIgst
        ? `<td class="num">${formatPaise(item.igst_amount)}</td>`
        : `<td class="num">${formatPaise(item.cgst_amount)}</td><td class="num">${formatPaise(item.sgst_amount)}</td>`;
      return `<tr>
        <td>${idx + 1}</td>
        <td>${esc(item.description)}</td>
        <td>${esc(item.hsn_code || '')}</td>
        <td>${item.quantity}</td>
        <td class="num">₹${formatPaise(item.unit_price)}</td>
        <td class="num">₹${formatPaise(disc)}</td>
        <td class="num">₹${formatPaise(taxable)}</td>
        <td class="num">${gstRate}%</td>
        ${taxCol}
        <td class="num"><strong>₹${formatPaise(item.amount)}</strong></td>
      </tr>`;
    }).join('');
  } else {
    itemsHeadSimple = `<tr><th>#</th><th>Description</th><th>Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>`;
    itemsBodySimple = items.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${esc(item.description)}</td>
        <td>${item.quantity}</td>
        <td class="r">₹${formatPaise(item.unit_price)}</td>
        <td class="r">₹${formatPaise(item.amount)}</td>
      </tr>`).join('');
  }

  const totalsRows = `
    <tr><td>Subtotal</td><td class="num">₹${formatPaise(inv.subtotal)}</td></tr>
    ${Number(inv.discount) > 0 ? `<tr><td>Discount</td><td class="num" style="color:#b91c1c">- ₹${formatPaise(inv.discount)}</td></tr>` : ''}
    ${Number(inv.cgst_amount) > 0 ? `<tr><td>CGST</td><td class="num">₹${formatPaise(inv.cgst_amount)}</td></tr>` : ''}
    ${Number(inv.sgst_amount) > 0 ? `<tr><td>SGST</td><td class="num">₹${formatPaise(inv.sgst_amount)}</td></tr>` : ''}
    ${Number(inv.igst_amount) > 0 ? `<tr><td>IGST</td><td class="num">₹${formatPaise(inv.igst_amount)}</td></tr>` : ''}
    <tr class="grand"><td>GRAND TOTAL</td><td class="num">₹${formatPaise(inv.total)}</td></tr>`;

  const totalsRowsSimple = `
    <tr><td>Subtotal</td><td class="r">₹${formatPaise(inv.subtotal)}</td></tr>
    ${Number(inv.discount) > 0 ? `<tr><td>Discount</td><td class="r">-₹${formatPaise(inv.discount)}</td></tr>` : ''}
    ${Number(inv.cgst_amount) > 0 ? `<tr><td>CGST</td><td class="r">₹${formatPaise(inv.cgst_amount)}</td></tr>` : ''}
    ${Number(inv.sgst_amount) > 0 ? `<tr><td>SGST</td><td class="r">₹${formatPaise(inv.sgst_amount)}</td></tr>` : ''}
    ${Number(inv.igst_amount) > 0 ? `<tr><td>IGST</td><td class="r">₹${formatPaise(inv.igst_amount)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="r">₹${formatPaise(inv.total)}</td></tr>`;

  const termsBlock = L.show_terms && L.terms_text
    ? `<div class="terms"><strong>Terms &amp; conditions</strong><br/>${esc(L.terms_text)}</div>`
    : '';

  const bankBlock = L.show_bank_details && L.bank_details
    ? `<div class="terms" style="margin-top:10px"><strong>Bank details</strong><br/>${esc(L.bank_details).replace(/\n/g, '<br/>')}</div>`
    : '';

  const signBlock = L.show_signature
    ? `<p style="font-size:10px">For <strong>${esc(inv.company_name)}</strong></p>
       <div style="min-height:36px">${signature ? `<img src="${signature}" alt="Signature" />` : ''}</div>
       <p style="font-size:10px;border-top:1px solid #333;padding-top:4px">Authorised Signatory</p>`
    : `<p style="font-size:10px">For <strong>${esc(inv.company_name)}</strong></p><p style="font-size:10px">Authorised Signatory</p>`;

  const signSimple = L.show_signature
    ? `<div>For ${esc(inv.company_name)}</div>${signature ? `<img src="${signature}" alt="sig" />` : '<div style="height:36px"></div>'}<div>Authorised Signatory</div>`
    : `<div>For ${esc(inv.company_name)}</div><div>Authorised Signatory</div>`;

  const einvoiceBlock = inv.irn
    ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:10px 14px;margin-bottom:12px;">
        <p style="font-size:9px;color:#16a34a;font-weight:600;">E-INVOICE (IRN)</p>
        <p style="font-size:10px;font-family:monospace;word-break:break-all;">${esc(inv.irn)}</p>
        ${inv.signed_qr && L.show_qr_code ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(inv.signed_qr)}" style="width:90px;height:90px;margin-top:6px" />` : ''}
       </div>`
    : '';

  const qrBlock = !inv.irn && L.show_qr_code
    ? '<div style="margin-top:12px;text-align:center;color:#94a3b8;font-size:9px;">QR placeholder</div>'
    : '';

  const loanBlock = L.show_loan_summary && inv.loan_amount != null && Number(inv.loan_amount) > 0
    ? `<div class="loan-box"><strong>Loan summary</strong><br/>
        Bank: ${esc(inv.loan_bank_name || '—')}<br/>
        Amount: ₹${formatPaise(inv.loan_amount)} · EMI: ₹${formatPaise(inv.loan_emi_amount || 0)} · Tenure: ${esc(inv.loan_tenure_months || '—')} months
       </div>`
    : '';

  const headerHtml = buildHeaderHtml(inv, L, logoBlock);

  const map = {
    PRIMARY_COLOR: esc(L.primary_color || '#1a56db'),
    FONT_FAMILY: font,
    HEADER_HTML: headerHtml,
    COMPANY_NAME: esc(inv.company_name),
    COMPANY_ADDRESS: esc(inv.company_address || ''),
    COMPANY_GSTIN: esc(inv.company_gstin || '—'),
    COMPANY_PHONE: esc(inv.company_phone || ''),
    INVOICE_NUMBER: esc(inv.invoice_number),
    INVOICE_DATE: formatDate(inv.invoice_date),
    CUSTOMER_NAME: esc(inv.customer_name),
    CUSTOMER_ADDRESS: esc(inv.customer_address || ''),
    CUSTOMER_PHONE: inv.customer_phone ? esc(`Phone: ${inv.customer_phone}`) : '',
    CUSTOMER_GSTIN_LINE: inv.customer_gstin ? esc(`GSTIN: ${inv.customer_gstin}`) : '',
    VEHICLE_BLOCK: vehicleInner,
    VEHICLE_SIMPLE: vehicleSimple,
    ITEMS_HEAD: itemsHead || '',
    ITEMS_BODY: itemsBody || '',
    ITEMS_HEAD_SIMPLE: itemsHeadSimple || '',
    ITEMS_BODY_SIMPLE: itemsBodySimple || '',
    TOTALS_ROWS: totalsRows,
    TOTALS_ROWS_SIMPLE: totalsRowsSimple,
    AMOUNT_WORDS: esc(amountInWordsFromPaise(inv.total)),
    TERMS_BLOCK: termsBlock,
    BANK_BLOCK: bankBlock,
    SIGNATURE_BLOCK: signBlock,
    SIGNATURE_BLOCK_SIMPLE: signSimple,
    EINVOICE_BLOCK: key === 'standard' ? einvoiceBlock : '',
    QR_BLOCK: qrBlock,
    FOOTER_TEXT: esc(L.footer_text || ''),
    LOAN_BLOCK: key === 'standard' ? loanBlock : '',
  };

  for (const [k, v] of Object.entries(map)) {
    html = html.split(`__${k}__`).join(v);
  }
  return html;
}

function buildDummyInvoiceData() {
  const invoice = {
    company_id: '00000000-0000-0000-0000-000000000000',
    invoice_number: 'INV-2025-DEMO-0001',
    invoice_date: new Date().toISOString().split('T')[0],
    status: 'confirmed',
    subtotal: 50000000,
    discount: 0,
    cgst_amount: 7000000,
    sgst_amount: 7000000,
    igst_amount: 0,
    total: 64000000,
    notes: 'Sample invoice for template preview.',
    company_name: 'Demo Motors Pvt Ltd',
    company_gstin: '27AABCD1234E1Z5',
    company_address: 'Plot 1, Industrial Estate, Goa 403001',
    company_phone: '9876543210',
    company_email: 'accounts@demo.com',
    logo_url: null,
    signature_url: null,
    customer_name: 'Sample Customer',
    customer_address: '21, Sample Street, Mapusa',
    customer_phone: '9123456789',
    customer_gstin: '27AAAAA0000A1Z5',
    chassis_number: 'MA3XXXXDEMO00001',
    engine_number: 'K12DEMO0001',
    vehicle_make: 'Maruti Suzuki',
    vehicle_model: 'Swift',
    vehicle_variant: 'VXi',
    vehicle_color: 'Pearl White',
    vehicle_year: 2025,
    irn: null,
    signed_qr: null,
    loan_bank_name: null,
    loan_amount: null,
    loan_emi_amount: null,
    loan_tenure_months: null,
    loan_due_date: null,
  };
  const items = [{
    description: 'Maruti Swift VXi — New vehicle',
    hsn_code: '8703',
    quantity: 1,
    unit_price: 50000000,
    cgst_rate: 14,
    sgst_rate: 14,
    igst_rate: 0,
    cgst_amount: 7000000,
    sgst_amount: 7000000,
    igst_amount: 0,
    amount: 64000000,
  }];
  return { invoice, items };
}

module.exports = {
  mergeLayout,
  fetchInvoiceTemplateRow,
  buildStandardInvoiceHtml,
  buildDummyInvoiceData,
  formatPaise,
  formatDate,
  amountInWordsFromPaise,
  findCompanyAsset,
  fileToDataUri,
  tryLegacyUploadUrl,
  esc,
};
