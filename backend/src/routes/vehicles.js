const { Router } = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole, requireNotRole, requireRole } = require('../middleware/role');
const vc = require('../controllers/vehiclesController');

const router = Router();

router.use(verifyToken);

const optionalText = (max) => z.union([z.string().max(max), z.null()]).optional();

const vehicleCompatFields = {
  chassis_number: optionalText(50),
  engine_number: optionalText(50),
  make: optionalText(100),
  model: optionalText(100),
  variant: optionalText(100),
  color: optionalText(50),
  year: z.union([z.number().int(), z.null()]).optional(),
  rto_number: optionalText(20),
  rto_date: optionalText(50),
  insurance_company: optionalText(255),
  insurance_expiry: optionalText(50),
  insurance_number: optionalText(100),
};

const createVehicleSchema = z.object({
  item_name: z.string().trim().optional(),
  sku: optionalText(200),
  category: optionalText(200),
  brand: optionalText(200),
  unit_of_measure: optionalText(50),
  quantity_in_stock: z.number().int().positive().optional(),
  is_serialized: z.boolean().optional(),
  purchase_price: z.number().int().positive('Purchase price must be positive'),
  selling_price: z.number().int().positive('Selling price must be positive'),
  hsn_code: optionalText(20),
  default_gst_rate: z.number().int().min(0).max(100).optional(),
  branch_id: z.string().uuid(),
  custom_fields: z.record(z.string(), z.any()).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  status: z.enum(['in_stock', 'sold', 'transferred', 'scrapped']).optional(),
  ...vehicleCompatFields,
}).passthrough();

const updateVehicleSchema = z.object({
  item_name: z.string().trim().optional(),
  sku: optionalText(200),
  category: optionalText(200),
  brand: optionalText(200),
  unit_of_measure: optionalText(50),
  quantity_in_stock: z.number().int().min(0).optional(),
  is_serialized: z.boolean().optional(),
  purchase_price: z.number().int().positive().optional(),
  selling_price: z.number().int().positive().optional(),
  hsn_code: optionalText(20),
  default_gst_rate: z.number().int().min(0).max(100).optional(),
  branch_id: z.string().uuid().optional(),
  custom_fields: z.record(z.string(), z.any()).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  status: z.enum(['in_stock', 'sold', 'transferred', 'scrapped']).optional(),
  ...vehicleCompatFields,
}).passthrough();

const transferSchema = z.object({
  to_branch_id: z.string().uuid('Valid branch ID required'),
  notes: z.string().max(1000).optional(),
});

const fieldDefinitionSchema = z.object({
  field_key: z.string().trim().min(1).max(100),
  field_label: z.string().trim().min(1).max(200),
  field_type: z.enum(['text', 'number', 'date', 'dropdown']).optional().default('text'),
  field_options: z.array(z.string().trim().min(1)).optional().default([]),
  is_required: z.boolean().optional().default(false),
  show_in_list: z.boolean().optional().default(false),
  sort_order: z.number().int().optional().default(0),
});

router.get('/', vc.listVehicles);
router.post('/', requireNotRole('ca'), validateBody(createVehicleSchema), vc.createVehicle);
router.get('/fields', requireRole('super_admin', 'company_admin', 'branch_manager', 'staff', 'ca'), vc.listItemFieldDefinitions);
router.post('/fields', requireMinRole('company_admin'), validateBody(fieldDefinitionSchema), vc.createItemFieldDefinition);
router.delete('/fields/:id', requireMinRole('company_admin'), vc.deleteItemFieldDefinition);
router.get('/check-sku', vc.checkSkuAvailable);
router.get('/check-chassis', vc.checkSkuAvailable);
router.get('/search', vc.searchVehicles);
router.get('/expiring-insurance', requireMinRole('branch_manager'), vc.expiringInsurance);
router.get('/inventory/summary', requireMinRole('branch_manager'), vc.inventorySummary);
router.get('/inventory/branch/:branchId', vc.branchInventory);
router.get('/barcodes/batch', requireMinRole('branch_manager'), vc.batchBarcodesPdf);
router.get('/:id/barcode', vc.getBarcode);
router.get('/:id/qrcode', vc.getQRCode);
router.get('/:id/label', requireMinRole('branch_manager'), vc.getVehicleLabelPdf);
router.get('/:id', vc.getVehicle);
router.patch('/:id', requireNotRole('ca'), requireMinRole('branch_manager'), validateBody(updateVehicleSchema), vc.updateVehicle);
router.post('/:id/transfer', requireNotRole('ca'), requireMinRole('branch_manager'), validateBody(transferSchema), vc.transferVehicle);

module.exports = router;
