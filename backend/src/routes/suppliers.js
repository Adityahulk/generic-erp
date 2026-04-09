const { Router } = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole, requireNotRole, requireRole } = require('../middleware/role');
const sc = require('../controllers/supplierController');

const router = Router();
router.use(verifyToken);

const supRead = requireRole('super_admin', 'company_admin', 'branch_manager', 'ca');
const supWrite = [requireNotRole('ca'), requireMinRole('branch_manager')];

const createSupplierSchema = z.object({
  name: z.string().min(1).max(255),
  gstin: z.string().max(15).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  state: z.string().max(100).optional(),
  bank_name: z.string().max(255).optional(),
  bank_account: z.string().max(50).optional(),
  ifsc_code: z.string().max(20).optional(),
  tcs_applicable: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const updateSupplierSchema = createSupplierSchema.partial();

router.post('/', ...supWrite, validateBody(createSupplierSchema), sc.createSupplier);
router.get('/', supRead, sc.listSuppliers);
router.get('/:id', supRead, sc.getSupplier);
router.patch('/:id', ...supWrite, validateBody(updateSupplierSchema), sc.updateSupplier);

module.exports = router;
