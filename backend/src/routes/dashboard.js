const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { requireMinRole, requireRole } = require('../middleware/role');
const { adminDashboard, branchDashboard } = require('../controllers/dashboardController');
const { caDashboard } = require('../controllers/caDashboardController');

router.use(verifyToken);

// Admin dashboard — company_admin or higher
router.get('/admin', requireMinRole('company_admin'), adminDashboard);

// CA finance overview (company-wide aggregates)
router.get('/ca', requireRole('ca'), caDashboard);

// Branch dashboard — any authenticated user (controller verifies branch access)
router.get('/branch/:branchId', branchDashboard);

module.exports = router;
