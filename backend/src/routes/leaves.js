const { Router } = require('express');
const { z } = require('zod');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { validateBody } = require('../middleware/validate');
const lc = require('../controllers/leavesController');

const router = Router();
router.use(verifyToken);

const createSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leave_type: z.enum(['casual', 'sick', 'earned', 'other']).optional(),
  reason: z.string().max(2000).optional(),
});

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  manager_note: z.string().max(1000).optional(),
});

router.post('/', requireRole('staff'), validateBody(createSchema), lc.createLeave);
router.get('/', lc.listLeaves);
router.patch('/:id/review', requireRole('branch_manager'), validateBody(reviewSchema), lc.reviewLeave);
router.patch('/:id/cancel', requireRole('staff'), lc.cancelLeave);

module.exports = router;
