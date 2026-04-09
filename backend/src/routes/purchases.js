const { Router } = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole, requireNotRole, requireRole } = require('../middleware/role');
const pc = require('../controllers/purchaseController');
const { generatePurchaseOrderPdf } = require('../services/pdfService');

const router = Router();
router.use(verifyToken);

const poRead = requireRole('super_admin', 'company_admin', 'branch_manager', 'ca');
const poWrite = [requireNotRole('ca'), requireMinRole('branch_manager')];

const poItemSchema = z.object({
  description: z.string().min(1).max(500),
  hsn_code: z.string().max(20).optional(),
  quantity: z.number().int().positive().optional().default(1),
  unit_price: z.number().int().min(0),
  gst_rate: z.number().min(0).max(100).optional(),
  vehicle_id: z.string().uuid().optional().nullable(),
  vehicle_data: z.record(z.string(), z.any()).optional().nullable(),
});

const createPoSchema = z.object({
  supplier_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  order_date: z.string().optional(),
  expected_delivery_date: z.string().optional().nullable(),
  discount: z.number().int().min(0).optional().default(0),
  notes: z.string().max(2000).optional(),
  items: z.array(poItemSchema).min(1),
});

const updatePoSchema = z.object({
  supplier_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  order_date: z.string().optional(),
  expected_delivery_date: z.string().optional().nullable(),
  discount: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(poItemSchema).min(1),
});

const receiveSchema = z.object({
  received_date: z.string().optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(z.object({
    purchase_order_item_id: z.string().uuid(),
    quantity_received: z.number().int().positive(),
    vehicle_data: z.object({
      chassis_number: z.string().optional(),
      engine_number: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      variant: z.string().optional(),
      color: z.string().optional(),
      year: z.union([z.number(), z.string()]).optional(),
      purchase_price: z.number().optional(),
      selling_price: z.number().optional(),
      rto_number: z.string().optional(),
      rto_date: z.string().optional(),
      insurance_company: z.string().optional(),
      insurance_expiry: z.string().optional(),
      insurance_number: z.string().optional(),
    }).passthrough().optional(),
  })).min(1),
});

router.get('/receipts', poRead, pc.listAllReceipts);
router.post('/', ...poWrite, validateBody(createPoSchema), pc.createPurchaseOrder);
router.get('/', poRead, pc.listPurchaseOrders);
router.get('/:id/receipts', poRead, pc.listReceiptsForPo);
router.get('/:id/pdf', poRead, async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const data = await pc.fetchFullPurchase(req.params.id, company_id);
    if (!data) return res.status(404).json({ error: 'Purchase order not found' });
    const pdfBuffer = await generatePurchaseOrderPdf(data);
    const fn = `${data.purchase_order.po_number.replace(/\//g, '-')}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fn}"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PO PDF generation failed:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});
router.post('/:id/confirm', ...poWrite, pc.confirmPurchaseOrder);
router.post('/:id/cancel', ...poWrite, pc.cancelPurchaseOrder);
router.post('/:id/receive', ...poWrite, validateBody(receiveSchema), pc.receivePurchase);
router.get('/:id', poRead, pc.getPurchaseOrder);
router.patch('/:id', ...poWrite, validateBody(updatePoSchema), pc.updatePurchaseOrder);

module.exports = router;
