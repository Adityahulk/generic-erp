const { isModuleEnabled } = require('../services/businessConfigService');

/**
 * Blocks the route when the company's merged business_config has modules[name] === false.
 * super_admin bypasses (platform operator).
 */
function requireModule(moduleName) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'super_admin') return next();
      const companyId = req.user?.company_id;
      if (!companyId) {
        return res.status(403).json({ error: 'Company context required' });
      }
      const ok = await isModuleEnabled(companyId, moduleName);
      if (!ok) {
        return res.status(404).json({ error: 'This module is not enabled for your account' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireModule };
