const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

function normalizeHeader(h) {
  return String(h ?? '')
    .replace(/\*/g, '')
    .replace(/\(₹\)/gi, '')
    .replace(/\(dd\/mm\/yyyy\)/gi, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function parseUploadedFile(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  const isXlsx = mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || ext === '.xlsx' || ext === '.xls';
  const isCsv = mimeType?.includes('csv') || ext === '.csv';
  const isJson = mimeType?.includes('json') || ext === '.json';

  if (isXlsx || (!isCsv && !isJson && (ext === '.xlsx' || ext === '.xls'))) {
    const wb = XLSX.readFile(filePath);
    const rows = [];
    const headerSet = new Set();
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!matrix.length) continue;
      const rawHeaders = (matrix[0] || []).map((h) => normalizeHeader(h));
      rawHeaders.forEach((h) => {
        if (h) headerSet.add(h);
      });
      for (let i = 1; i < matrix.length; i++) {
        const line = matrix[i];
        if (!line || !line.some((c) => c !== '' && c != null)) continue;
        const obj = {};
        let hasAny = false;
        rawHeaders.forEach((key, j) => {
          if (!key) return;
          const val = line[j];
          if (val !== '' && val != null) hasAny = true;
          obj[key] = val;
        });
        if (hasAny) rows.push(obj);
      }
    }
    return { headers: [...headerSet].sort(), rows, totalRows: rows.length };
  }

  if (isCsv) {
    const text = fs.readFileSync(filePath, 'utf8');
    const records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
    if (!records.length) return { headers: [], rows: [], totalRows: 0 };
    const headers = Object.keys(records[0]).map(normalizeHeader);
    const rows = records.map((r) => {
      const obj = {};
      Object.keys(r).forEach((k) => {
        obj[normalizeHeader(k)] = r[k];
      });
      return obj;
    });
    return { headers, rows, totalRows: rows.length };
  }

  if (isJson) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const arr = Array.isArray(raw) ? raw : raw.rows || [];
    if (!arr.length) return { headers: [], rows: [], totalRows: 0 };
    const headers = Object.keys(arr[0]).map(normalizeHeader);
    const rows = arr.map((item) => {
      const obj = {};
      Object.keys(item).forEach((k) => {
        obj[normalizeHeader(k)] = item[k];
      });
      return obj;
    });
    return { headers, rows, totalRows: rows.length };
  }

  throw new Error('Unsupported file type');
}

function parseDdMmYyyy(s) {
  if (s == null || s === '') return null;
  if (s instanceof Date && !Number.isNaN(s.getTime())) {
    return s.toISOString().split('T')[0];
  }
  const str = String(s).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Template amounts are in rupees → paise */
function rupeesCellToPaise(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) {
    return Math.round(v * 100);
  }
  const n = parseFloat(String(v).replace(/,/g, '').replace(/₹/g, '').trim());
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function requireStr(row, field, errors) {
  const v = row[field];
  if (v == null || String(v).trim() === '') {
    errors.push(`${field} is required`);
    return null;
  }
  return String(v).trim();
}

function validateVehicleImportRow(row, rowIndex) {
  const errors = [];
  const chassis_number = requireStr(row, 'chassis_number', errors);
  const engine_number = requireStr(row, 'engine_number', errors);
  const make = requireStr(row, 'make', errors);
  const model = requireStr(row, 'model', errors);
  const variant = requireStr(row, 'variant', errors);
  const color = requireStr(row, 'color', errors);
  const yearRaw = row.year;
  if (yearRaw == null || yearRaw === '') errors.push('year is required');
  const year = parseInt(yearRaw, 10);
  if (Number.isNaN(year) || year < 1900 || year > 2100) errors.push('year must be a valid year');

  const purchase_price = rupeesCellToPaise(row.purchase_price);
  if (purchase_price == null || purchase_price < 0) errors.push('purchase_price is invalid');

  const selling_price = rupeesCellToPaise(row.selling_price);
  if (selling_price == null || selling_price < 0) errors.push('selling_price is invalid');

  const rto_date = row.rto_number || row.rto_date ? parseDdMmYyyy(row.rto_date) : null;
  if (row.rto_date && !rto_date) errors.push('rto_date must be DD/MM/YYYY');

  const insurance_expiry = row.insurance_expiry ? parseDdMmYyyy(row.insurance_expiry) : null;
  if (row.insurance_expiry && !insurance_expiry) errors.push('insurance_expiry must be DD/MM/YYYY');

  const data = {
    chassis_number,
    engine_number,
    make,
    model,
    variant,
    color,
    year,
    purchase_price,
    selling_price,
    rto_number: row.rto_number ? String(row.rto_number).trim() : null,
    rto_date,
    insurance_company: row.insurance_company ? String(row.insurance_company).trim() : null,
    insurance_expiry,
    insurance_number: row.insurance_number ? String(row.insurance_number).trim() : null,
  };

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? data : null,
    rowIndex,
  };
}

async function validateSaleImportRow(row, rowIndex, queryFn, companyId) {
  const errors = [];
  const chassis_number = requireStr(row, 'chassis_number', errors);
  const customer_name = requireStr(row, 'customer_name', errors);
  const customer_phone = requireStr(row, 'customer_phone', errors);
  const sale_date = parseDdMmYyyy(row.sale_date);
  if (!row.sale_date) errors.push('sale_date is required');
  else if (!sale_date) errors.push('sale_date must be DD/MM/YYYY');

  const total_amount = rupeesCellToPaise(row.total_amount);
  if (total_amount == null || total_amount <= 0) errors.push('total_amount is invalid');

  let vehicle_id = null;
  if (chassis_number && errors.length === 0) {
    const { rows } = await queryFn(
      `SELECT id FROM vehicles
       WHERE chassis_number = $1 AND company_id = $2 AND status = 'in_stock' AND is_deleted = FALSE`,
      [chassis_number, companyId],
    );
    if (rows.length === 0) errors.push('chassis_number not found in stock');
    else vehicle_id = rows[0].id;
  }

  const data = {
    chassis_number,
    vehicle_id,
    customer_name,
    customer_phone,
    customer_gstin: row.customer_gstin ? String(row.customer_gstin).trim() : null,
    customer_address: row.customer_address ? String(row.customer_address).trim() : null,
    bank_name: row.bank_name ? String(row.bank_name).trim() : null,
    loan_amount: row.loan_amount != null && row.loan_amount !== '' ? rupeesCellToPaise(row.loan_amount) : null,
    notes: row.notes ? String(row.notes).trim() : null,
    sale_date,
    total_amount,
  };

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? data : null,
    rowIndex,
  };
}

function validatePurchaseImportRow(row, rowIndex) {
  const errors = [];
  const supplier_name = requireStr(row, 'supplier_name', errors);
  const chassis_number = requireStr(row, 'chassis_number', errors);
  const engine_number = requireStr(row, 'engine_number', errors);
  const make = requireStr(row, 'make', errors);
  const model = requireStr(row, 'model', errors);
  const variant = requireStr(row, 'variant', errors);
  const color = requireStr(row, 'color', errors);
  const yearRaw = row.year;
  if (yearRaw == null || yearRaw === '') errors.push('year is required');
  const year = parseInt(yearRaw, 10);
  if (Number.isNaN(year) || year < 1900 || year > 2100) errors.push('year must be a valid year');

  const purchase_price = rupeesCellToPaise(row.purchase_price);
  if (purchase_price == null || purchase_price < 0) errors.push('purchase_price is invalid');

  const received_date = parseDdMmYyyy(row.received_date);
  if (!row.received_date) errors.push('received_date is required');
  else if (!received_date) errors.push('received_date must be DD/MM/YYYY');

  const selling_price = row.selling_price != null && row.selling_price !== ''
    ? rupeesCellToPaise(row.selling_price)
    : 0;

  const insurance_expiry = row.insurance_expiry ? parseDdMmYyyy(row.insurance_expiry) : null;
  if (row.insurance_expiry && !insurance_expiry) errors.push('insurance_expiry must be DD/MM/YYYY');

  const data = {
    supplier_name,
    chassis_number,
    engine_number,
    make,
    model,
    variant,
    color,
    year,
    purchase_price,
    selling_price,
    received_date,
    rto_number: row.rto_number ? String(row.rto_number).trim() : null,
    insurance_company: row.insurance_company ? String(row.insurance_company).trim() : null,
    insurance_expiry,
    insurance_number: row.insurance_number ? String(row.insurance_number).trim() : null,
  };

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? data : null,
    rowIndex,
  };
}

async function loadCustomFieldKeys(companyId, queryFn) {
  const { rows } = await queryFn(
    `SELECT field_key FROM item_field_definitions WHERE company_id = $1 ORDER BY sort_order ASC, field_key ASC`,
    [companyId],
  );
  return rows.map((r) => r.field_key);
}

function strCell(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return null;
}

/**
 * Legacy vehicle rows (strict chassis/engine/make/…) or generic rows (sku+item_name+prices + optional custom fields).
 */
async function validateVehiclesImportRowFlexible(row, rowIndex, companyId, queryFn) {
  const legacy = validateVehicleImportRow(row, rowIndex);
  if (legacy.valid) {
    const d = legacy.data;
    const item_name = [d.make, d.model, d.variant].filter(Boolean).join(' ').trim() || d.make || 'Imported item';
    return {
      valid: true,
      errors: [],
      data: {
        mode: 'legacy',
        item_name,
        sku: d.chassis_number,
        chassis_number: d.chassis_number,
        engine_number: d.engine_number,
        purchase_price: d.purchase_price,
        selling_price: d.selling_price,
        make: d.make,
        model: d.model,
        variant: d.variant,
        color: d.color,
        year: d.year,
        rto_number: d.rto_number,
        rto_date: d.rto_date,
        insurance_company: d.insurance_company,
        insurance_expiry: d.insurance_expiry,
        insurance_number: d.insurance_number,
        custom_fields: {},
        is_serialized: true,
        quantity_in_stock: 1,
        hsn_code: row.hsn_code ? String(row.hsn_code).trim() : null,
        default_gst_rate: row.default_gst_rate != null && row.default_gst_rate !== ''
          ? parseInt(row.default_gst_rate, 10)
          : null,
      },
      rowIndex,
    };
  }

  const sku = strCell(row, 'sku', 'chassis_number', 'item_code');
  const item_name = strCell(row, 'item_name', 'name', 'title');
  const purchase_price = rupeesCellToPaise(row.purchase_price);
  const selling_price = rupeesCellToPaise(row.selling_price);
  const errors = [];

  if (!sku) errors.push('sku or chassis_number is required');
  if (!item_name) errors.push('item_name (or name) is required');
  if (purchase_price == null || purchase_price < 0) errors.push('purchase_price is invalid');
  if (selling_price == null || selling_price < 0) errors.push('selling_price is invalid');

  const custom_fields = {};
  const keys = await loadCustomFieldKeys(companyId, queryFn);
  const norm = { ...row };
  Object.keys(norm).forEach((k) => {
    if (keys.includes(k) && norm[k] !== '' && norm[k] != null) {
      custom_fields[k] = norm[k];
    }
  });
  ['make', 'model', 'variant', 'color', 'brand', 'category'].forEach((k) => {
    if (row[k] != null && String(row[k]).trim() !== '') custom_fields[k] = String(row[k]).trim();
  });
  if (row.year != null && String(row.year).trim() !== '') {
    const y = parseInt(row.year, 10);
    if (!Number.isNaN(y) && y >= 1900 && y <= 2100) custom_fields.year = y;
  }

  const isSerializedRaw = row.is_serialized ?? row.serialized;
  const is_serialized = !(String(isSerializedRaw).toLowerCase() === 'false' || isSerializedRaw === false || isSerializedRaw === 0);
  let quantity_in_stock = 1;
  if (!is_serialized) {
    const q = parseInt(row.quantity_in_stock ?? row.quantity ?? '0', 10);
    quantity_in_stock = Number.isNaN(q) ? 0 : Math.max(0, q);
  }

  if (errors.length) {
    return { valid: false, errors, data: null, rowIndex };
  }

  const engine = strCell(row, 'engine_number', 'item_code2') || (is_serialized ? sku : '-');

  return {
    valid: true,
    errors: [],
    data: {
      mode: 'generic',
      item_name,
      sku,
      chassis_number: sku,
      engine_number: engine,
      purchase_price,
      selling_price,
      make: row.make ? String(row.make).trim() : null,
      model: row.model ? String(row.model).trim() : null,
      variant: row.variant ? String(row.variant).trim() : null,
      color: row.color ? String(row.color).trim() : null,
      year: custom_fields.year != null ? custom_fields.year : null,
      rto_number: null,
      rto_date: null,
      insurance_company: null,
      insurance_expiry: null,
      insurance_number: null,
      custom_fields,
      is_serialized,
      quantity_in_stock,
      hsn_code: row.hsn_code ? String(row.hsn_code).trim() : null,
      default_gst_rate: row.default_gst_rate != null && row.default_gst_rate !== ''
        ? parseInt(row.default_gst_rate, 10)
        : null,
    },
    rowIndex,
  };
}

async function buildVehicleImportTemplateSheet(companyId, queryFn) {
  const { getMergedConfig } = require('./businessConfigService');
  const merged = await getMergedConfig(companyId, { bypassCache: true });
  const term = merged.terminology || {};
  const codeLabel = (term.item_code || 'SKU').replace(/\*/g, '');
  const code2Label = term.item_code2 ? String(term.item_code2).replace(/\*/g, '') : null;
  const customKeys = await loadCustomFieldKeys(companyId, queryFn);

  const genericHeaders = [
    `${codeLabel}*`,
    ...(code2Label ? [`${code2Label}`] : []),
    'Item name*',
    'Purchase Price (₹)*',
    'Selling Price (₹)*',
    'Make',
    'Model',
    'Variant',
    'Color',
    'Year',
    'Category',
    'Brand',
    'HSN Code',
    'Default GST %',
    'Quantity (non-serialized)',
    'Is serialized (true/false)',
    ...customKeys.map((k) => k.replace(/_/g, ' ')),
  ];
  const legacyHeaders = [
    'Chassis Number*', 'Engine Number*', 'Make*', 'Model*', 'Variant*', 'Color*', 'Year*',
    'Purchase Price (₹)*', 'Selling Price (₹)*', 'RTO Number', 'RTO Date (DD/MM/YYYY)',
    'Insurance Company', 'Insurance Number', 'Insurance Expiry (DD/MM/YYYY)',
  ];

  const wb = XLSX.utils.book_new();
  const wsLegacy = XLSX.utils.aoa_to_sheet([legacyHeaders]);
  wsLegacy['!cols'] = legacyHeaders.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsLegacy, 'Legacy vehicle');

  const wsGeneric = XLSX.utils.aoa_to_sheet([genericHeaders]);
  wsGeneric['!cols'] = genericHeaders.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsGeneric, 'Generic');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildTemplateSheet(type) {
  let headers;
  let example;
  if (type === 'vehicles') {
    headers = [
      'Chassis Number*', 'Engine Number*', 'Make*', 'Model*', 'Variant*', 'Color*', 'Year*',
      'Purchase Price (₹)*', 'Selling Price (₹)*', 'RTO Number', 'RTO Date (DD/MM/YYYY)',
      'Insurance Company', 'Insurance Number', 'Insurance Expiry (DD/MM/YYYY)',
    ];
    example = [
      'MA3XXXX00000001', 'K12EN0000001', 'Maruti Suzuki', 'Swift', 'VXi', 'Red', 2025,
      600000, 650000, 'GA-01-AB-1234', '15/01/2025', 'ICICI Lombard', 'POL123', '15/01/2026',
    ];
  } else if (type === 'sales') {
    headers = [
      'Chassis Number*', 'Customer Name*', 'Customer Phone*', 'Sale Date (DD/MM/YYYY)*',
      'Total Amount (₹)*', 'Customer GSTIN', 'Customer Address', 'Bank Name', 'Loan Amount (₹)', 'Notes',
    ];
    example = [
      'MA3FJEB1S00123456', 'Ravi Kamat', '9876500000', '01/04/2025',
      750000, '', 'Mapusa, Goa', 'SBI', '', '',
    ];
  } else {
    headers = [
      'Supplier Name*', 'Chassis Number*', 'Engine Number*', 'Make*', 'Model*', 'Variant*', 'Color*', 'Year*',
      'Purchase Price (₹)*', 'Received Date (DD/MM/YYYY)*', 'Selling Price (₹)', 'RTO Number',
      'Insurance Company', 'Insurance Expiry (DD/MM/YYYY)',
    ];
    example = [
      'ABC Motors Pvt Ltd', 'MA3XXXX00000002', 'K12EN0000002', 'Hyundai', 'i20', 'Sportz', 'White', 2025,
      800000, '05/04/2025', 850000, '', 'HDFC ERGO', '10/05/2026',
    ];
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Import');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseUploadedFile,
  validateVehicleImportRow,
  validateVehiclesImportRowFlexible,
  validateSaleImportRow,
  validatePurchaseImportRow,
  buildTemplateSheet,
  buildVehicleImportTemplateSheet,
  parseDdMmYyyy,
  rupeesCellToPaise,
};
