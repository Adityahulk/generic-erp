const { Router } = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/role');
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

router.post('/preview-html', requireMinRole('branch_manager'), validateBody(previewBodySchema), qc.previewQuotationHtmlFromBody);

router.post('/', requireMinRole('branch_manager'), validateBody(createQuotationSchema), qc.createQuotation);
router.get('/', requireMinRole('branch_manager'), qc.listQuotations);

router.get('/:id/pdf', requireMinRole('branch_manager'), qc.getQuotationPdf);
router.get('/:id/preview-html', requireMinRole('branch_manager'), qc.getQuotationPreviewHtml);
router.get('/:id/share-link', requireMinRole('branch_manager'), qc.shareQuotationLink);

router.post('/:id/send', requireMinRole('branch_manager'), qc.sendQuotation);
router.post('/:id/accept', requireMinRole('branch_manager'), qc.acceptQuotation);
router.post('/:id/reject', requireMinRole('branch_manager'), qc.rejectQuotation);
router.post('/:id/convert', requireMinRole('branch_manager'), qc.convertToInvoice);
router.post('/:id/duplicate', requireMinRole('branch_manager'), qc.duplicateQuotation);

router.patch('/:id', requireMinRole('branch_manager'), validateBody(updateQuotationSchema), qc.updateQuotation);
router.delete('/:id', requireMinRole('branch_manager'), qc.deleteQuotation);

router.get('/:id', requireMinRole('branch_manager'), qc.getQuotation);

module.exports = router;
