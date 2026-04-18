const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const cc = require('../controllers/configController');

const router = Router();
router.use(verifyToken);

const adminConfig = requireRole('company_admin', 'super_admin');

router.get('/', cc.getConfig);
router.get('/templates', adminConfig, cc.getTemplates);
router.patch('/', adminConfig, cc.patchConfig);
router.post('/reset/:businessType', adminConfig, cc.resetConfig);

module.exports = router;
