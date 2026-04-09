const { Router } = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole, requireNotRole, requireRole } = require('../middleware/role');
const qc = require('../controllers/quotationsController');

const router = Router();
router.use(verifyToken);

const itemTypeEnum = z.enum(['vehicle', 'accessory', 'insurance', 'rto', 'other']);
const lineDiscountEnum = z.enum(['flat', 'percent', 'none']);
const headerDiscountEnum = z.enum(['flat', 'percent']);

const quotationLineSchema = z.object({
  item_type: itemTypeEnum.default('other'),
  description: z.string().min(1).max(500),
  hsn_code: z.string().max(20).optional().nullable(),
  quantity: z.number().int().min(1).optional().default(1),
  unit_price: z.number().int().min(0),
  discount_type: lineDiscountEnum.optional().default('none'),
  discount_value: z.number().int().min(0).optional().default(0),
  gst_rate: z.number().min(0).max(100),
  sort_order: z.number().int().optional(),
});

const vehicleOverrideSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  color: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
}).optional();

const quotationFields = {
  branch_id: z.string().uuid().optional(),
  quotation_date: z.string().optional(),
  valid_until_date: z.string().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name_override: z.string().max(255).optional().nullable(),
  customer_phone_override: z.string().max(50).optional().nullable(),
  customer_email_override: z.string().max(255).optional().nullable(),
  customer_address_override: z.string().optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable(),
  vehicle_details_override: vehicleOverrideSchema.nullable(),
  items: z.array(quotationLineSchema).min(1),
  discount_type: headerDiscountEnum.optional().default('flat'),
  discount_value: z.number().int().min(0).optional().default(0),
  notes: z.string().optional().nullable(),
  customer_notes: z.string().optional().nullable(),
  terms_and_conditions: z.string().optional().nullable(),
};

const customerRefine = (d) => d.customer_id || (d.customer_name_override && d.customer_phone_override);

const createQuotationSchema = z.object({
  ...quotationFields,
  status: z.literal('draft').optional().default('draft'),
}).refine(customerRefine, { message: 'Either customer_id or walk-in name + phone required' });

const updateQuotationSchema = z.object({
  ...quotationFields,
  status: z.enum(['draft', 'sent']).optional(),
}).refine(customerRefine, { message: 'Either customer_id or walk-in name + phone required' });

const previewBodySchema = createQuotationSchema;

const qRead = requireRole('super_admin', 'company_admin', 'branch_manager', 'ca', 'staff');
const qWrite = [requireNotRole('ca'), requireMinRole('branch_manager')];

router.post('/preview-html', qRead, validateBody(previewBodySchema), qc.previewQuotationHtmlFromBody);

router.post('/', ...qWrite, validateBody(createQuotationSchema), qc.createQuotation);
router.get('/', qRead, qc.listQuotations);

router.get('/:id/pdf', qRead, qc.getQuotationPdf);
router.get('/:id/preview-html', qRead, qc.getQuotationPreviewHtml);
router.get('/:id/share-link', qRead, qc.shareQuotationLink);

router.post('/:id/send', ...qWrite, qc.sendQuotation);
router.post('/:id/accept', ...qWrite, qc.acceptQuotation);
router.post('/:id/reject', ...qWrite, qc.rejectQuotation);
router.post('/:id/convert', ...qWrite, qc.convertToInvoice);
router.post('/:id/duplicate', ...qWrite, qc.duplicateQuotation);

router.patch('/:id', ...qWrite, validateBody(updateQuotationSchema), qc.updateQuotation);
router.delete('/:id', ...qWrite, qc.deleteQuotation);

router.get('/:id', qRead, qc.getQuotation);

module.exports = router;
