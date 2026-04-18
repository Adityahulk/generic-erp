const { query } = require('../config/db');
const redis = require('../config/redis');

const CACHE_PREFIX = 'erp:config:';
const CACHE_TTL = 600;

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const bv = out[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, pv);
    } else if (pv !== undefined) {
      out[k] = pv;
    }
  }
  return out;
}

const BUSINESS_TYPES = new Set([
  'vehicle_dealer', 'pharmacy', 'electronics', 'furniture', 'hardware', 'general_trade', 'custom',
]);

function templateForType(businessType) {
  const t = businessType && BUSINESS_TYPES.has(businessType) ? businessType : 'general_trade';
  const templates = {
    vehicle_dealer: {
      terminology: {
        item: 'Vehicle',
        items: 'Vehicles',
        item_code: 'Chassis Number',
        item_code2: 'Engine Number',
        item_code3: null,
        stock_location: 'Branch',
        supplier: 'Manufacturer',
        transfer: 'Stock Transfer',
      },
      modules: {
        loans: true,
        eway_bill: true,
        rto_insurance: true,
        barcode: true,
        batch_tracking: false,
        serial_tracking: true,
        quotations: true,
        expenses: true,
        attendance: true,
        employee_hr: true,
      },
      invoice_defaults: {
        default_hsn: '8703',
        default_gst_rate: 28,
        additional_item_types: [
          { label: 'Accessories', hsn: '8714', gst_rate: 18 },
          { label: 'Insurance', hsn: '9971', gst_rate: 18 },
          { label: 'RTO Charges', hsn: '', gst_rate: 0 },
        ],
      },
      ui: { primary_color: '#6366f1', show_margin: true, date_format: 'DD MMM YYYY', currency: 'INR' },
    },
    pharmacy: {
      terminology: {
        item: 'Medicine',
        items: 'Medicines',
        item_code: 'Batch Number',
        item_code2: null,
        item_code3: null,
        stock_location: 'Branch',
        supplier: 'Distributor',
        transfer: 'Stock Transfer',
      },
      modules: {
        loans: false,
        eway_bill: true,
        rto_insurance: false,
        barcode: true,
        batch_tracking: true,
        serial_tracking: false,
        quotations: true,
        expenses: true,
        attendance: true,
        employee_hr: true,
      },
      invoice_defaults: {
        default_hsn: '3004',
        default_gst_rate: 12,
        additional_item_types: [{ label: 'Dispensing Fee', hsn: '9999', gst_rate: 0 }],
      },
      ui: { primary_color: '#059669', show_margin: true, date_format: 'DD MMM YYYY', currency: 'INR' },
    },
    electronics: {
      terminology: {
        item: 'Product',
        items: 'Products',
        item_code: 'IMEI / Serial No',
        item_code2: 'Model Number',
        item_code3: null,
        stock_location: 'Branch',
        supplier: 'Distributor',
        transfer: 'Stock Transfer',
      },
      modules: {
        loans: true,
        eway_bill: true,
        rto_insurance: false,
        barcode: true,
        batch_tracking: false,
        serial_tracking: true,
        quotations: true,
        expenses: true,
        attendance: true,
        employee_hr: true,
      },
      invoice_defaults: {
        default_hsn: '8517',
        default_gst_rate: 18,
        additional_item_types: [],
      },
      ui: { primary_color: '#4f46e5', show_margin: true, date_format: 'DD MMM YYYY', currency: 'INR' },
    },
    furniture: {
      terminology: {
        item: 'Product',
        items: 'Products',
        item_code: 'Serial Number',
        item_code2: null,
        item_code3: null,
        stock_location: 'Branch',
        supplier: 'Manufacturer',
        transfer: 'Stock Transfer',
      },
      modules: {
        loans: true,
        eway_bill: true,
        rto_insurance: false,
        barcode: true,
        batch_tracking: false,
        serial_tracking: true,
        quotations: true,
        expenses: true,
        attendance: true,
        employee_hr: true,
      },
      invoice_defaults: {
        default_hsn: '9403',
        default_gst_rate: 18,
        additional_item_types: [],
      },
      ui: { primary_color: '#b45309', show_margin: true, date_format: 'DD MMM YYYY', currency: 'INR' },
    },
    hardware: {
      terminology: {
        item: 'Product',
        items: 'Products',
        item_code: 'SKU / Item Code',
        item_code2: null,
        item_code3: null,
        stock_location: 'Branch',
        supplier: 'Supplier',
        transfer: 'Stock Transfer',
      },
      modules: {
        loans: false,
        eway_bill: true,
        rto_insurance: false,
        barcode: true,
        batch_tracking: false,
        serial_tracking: false,
        quotations: true,
        expenses: true,
        attendance: true,
        employee_hr: true,
      },
      invoice_defaults: {
        default_hsn: '',
        default_gst_rate: 18,
        additional_item_types: [],
      },
      ui: { primary_color: '#0d9488', show_margin: true, date_format: 'DD MMM YYYY', currency: 'INR' },
    },
    general_trade: {
      terminology: {
        item: 'Product',
        items: 'Products',
        item_code: 'SKU',
        item_code2: 'Barcode',
        item_code3: null,
        stock_location: 'Branch',
        supplier: 'Supplier',
        transfer: 'Stock Transfer',
      },
      modules: {
        loans: false,
        eway_bill: true,
        rto_insurance: false,
        barcode: true,
        batch_tracking: false,
        serial_tracking: false,
        quotations: true,
        expenses: true,
        attendance: true,
        employee_hr: true,
      },
      invoice_defaults: {
        default_hsn: '',
        default_gst_rate: 18,
        additional_item_types: [],
      },
      ui: { primary_color: '#6366f1', show_margin: true, date_format: 'DD MMM YYYY', currency: 'INR' },
    },
    custom: {
      terminology: {
        item: 'Item',
        items: 'Items',
        item_code: 'Item Code',
        item_code2: null,
        item_code3: null,
        stock_location: 'Branch',
        supplier: 'Supplier',
        transfer: 'Stock Transfer',
      },
      modules: {
        loans: true,
        eway_bill: true,
        rto_insurance: false,
        barcode: true,
        batch_tracking: false,
        serial_tracking: true,
        quotations: true,
        expenses: true,
        attendance: true,
        employee_hr: true,
      },
      invoice_defaults: {
        default_hsn: '',
        default_gst_rate: 18,
        additional_item_types: [],
      },
      ui: { primary_color: '#6366f1', show_margin: true, date_format: 'DD MMM YYYY', currency: 'INR' },
    },
  };
  return JSON.parse(JSON.stringify(templates[t] || templates.general_trade));
}

function listTemplates() {
  return [
    { id: 'vehicle_dealer', name: 'Vehicle dealer', description: 'Chassis/engine, loans, RTO & insurance' },
    { id: 'pharmacy', name: 'Pharmacy', description: 'Batch tracking, distributor-focused defaults' },
    { id: 'electronics', name: 'Electronics', description: 'Serial / IMEI, warranty-friendly defaults' },
    { id: 'furniture', name: 'Furniture', description: 'Serial numbers, material & dimensions' },
    { id: 'hardware', name: 'Hardware / building materials', description: 'SKU-led, quantity stock' },
    { id: 'general_trade', name: 'General trade', description: 'SKU + barcode, balanced modules' },
    { id: 'custom', name: 'Custom', description: 'Start from a neutral template and tune in Settings' },
  ];
}

async function fetchCompanyConfigRow(companyId) {
  const { rows } = await query(
    `SELECT id, name, business_type, business_config, item_terminology, item_terminology_plural,
            default_hsn_code, default_gst_rate, invoice_defaults, onboarding_completed
     FROM companies WHERE id = $1 AND is_deleted = FALSE`,
    [companyId],
  );
  return rows[0] || null;
}

function buildMergedFromRow(row) {
  if (!row) return null;
  const type = row.business_type || 'vehicle_dealer';
  const base = templateForType(type);
  const merged = deepMerge(base, row.business_config || {});

  if (row.item_terminology) {
    merged.terminology = { ...merged.terminology, item: row.item_terminology };
  }
  if (row.item_terminology_plural) {
    merged.terminology = { ...merged.terminology, items: row.item_terminology_plural };
  }

  const invFromCompany = row.invoice_defaults && typeof row.invoice_defaults === 'object'
    ? row.invoice_defaults
    : {};
  merged.invoice_defaults = deepMerge(merged.invoice_defaults || {}, invFromCompany);

  if (row.default_hsn_code != null && row.default_hsn_code !== '') {
    merged.invoice_defaults.default_hsn = row.default_hsn_code;
  }
  if (row.default_gst_rate != null && row.default_gst_rate !== '') {
    merged.invoice_defaults.default_gst_rate = Number(row.default_gst_rate);
  }

  return {
    business_type: type,
    terminology: merged.terminology,
    modules: merged.modules,
    invoice_defaults: merged.invoice_defaults,
    ui: merged.ui,
    raw_business_config: row.business_config || {},
  };
}

async function getMergedConfig(companyId, { bypassCache = false } = {}) {
  const key = CACHE_PREFIX + companyId;
  if (!bypassCache && redis) {
    try {
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit);
    } catch {
      /* ignore cache errors */
    }
  }

  const row = await fetchCompanyConfigRow(companyId);
  const merged = buildMergedFromRow(row);

  if (!bypassCache && merged && redis) {
    try {
      await redis.setex(key, CACHE_TTL, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  return merged;
}

async function invalidateConfigCache(companyId) {
  if (!redis) return;
  try {
    await redis.del(CACHE_PREFIX + companyId);
  } catch {
    /* ignore */
  }
}

async function isModuleEnabled(companyId, moduleName) {
  const cfg = await getMergedConfig(companyId);
  if (!cfg || !cfg.modules) return true;
  const v = cfg.modules[moduleName];
  return v !== false;
}

module.exports = {
  deepMerge,
  templateForType,
  listTemplates,
  BUSINESS_TYPES,
  getMergedConfig,
  invalidateConfigCache,
  isModuleEnabled,
  fetchCompanyConfigRow,
  buildMergedFromRow,
};
