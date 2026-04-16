const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const {
  gstr1,
  gstr1Export,
  salesSummary,
  gstr3bExport,
  purchaseRegisterExport,
  salesRegisterExport,
  expenseRegisterExport,
  plSummaryPdf,
} = require('../controllers/reportsController');

const router = Router();

router.use(verifyToken);

const reportAccess = requireRole('super_admin', 'company_admin', 'ca');

router.get('/gstr1', reportAccess, gstr1);
router.get('/gstr1/export', reportAccess, gstr1Export);
router.get('/gstr3b/export', reportAccess, gstr3bExport);
router.get('/purchase-register/export', reportAccess, purchaseRegisterExport);
router.get('/sales-register/export', reportAccess, salesRegisterExport);
router.get('/expenses/export', reportAccess, expenseRegisterExport);
router.get('/pl-summary/pdf', reportAccess, plSummaryPdf);
router.get('/sales-summary', reportAccess, salesSummary);

module.exports = router;
