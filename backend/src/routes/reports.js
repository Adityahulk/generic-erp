const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const {
  gstr1,
  gstr1Export,
  salesSummary,
  stockAging,
} = require('../controllers/reportsController');

const router = Router();

router.use(verifyToken);

const reportAccess = requireRole('super_admin', 'company_admin', 'ca');

router.get('/gstr1', reportAccess, gstr1);
router.get('/gstr1/export', reportAccess, gstr1Export);
router.get('/sales-summary', reportAccess, salesSummary);
router.get('/stock-aging', reportAccess, stockAging);

module.exports = router;
