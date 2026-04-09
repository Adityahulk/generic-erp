const { Router } = require('express');
const { z } = require('zod');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole, requireRole } = require('../middleware/role');
const { validateBody } = require('../middleware/validate');
const itc = require('../controllers/invoiceTemplateController');

const router = Router();
router.use(verifyToken);

const layoutConfigSchema = z.record(z.string(), z.any()).optional();

const createSchema = z.object({
  name: z.string().min(1).max(255),
  template_key: z.string().min(1).max(50),
  is_default: z.boolean().optional(),
  layout_config: layoutConfigSchema,
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  layout_config: layoutConfigSchema,
}).refine((d) => d.name !== undefined || d.layout_config !== undefined, {
  message: 'At least one of name or layout_config is required',
});

router.get('/', requireRole('super_admin', 'company_admin', 'branch_manager', 'ca'), itc.listTemplates);
router.post('/', requireMinRole('company_admin'), validateBody(createSchema), itc.createTemplate);
router.patch('/:id', requireMinRole('company_admin'), validateBody(updateSchema), itc.updateTemplate);
router.delete('/:id', requireMinRole('company_admin'), itc.deleteTemplate);
router.post('/:id/set-default', requireMinRole('company_admin'), itc.setDefaultTemplate);

module.exports = router;
