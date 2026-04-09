/**
 * Role hierarchy for permission checks (higher number = more privilege):
 * super_admin > company_admin > branch_manager > ca > staff
 */
const ROLE_HIERARCHY = {
  super_admin: 5,
  company_admin: 4,
  branch_manager: 3,
  ca: 2,
  staff: 1,
};

/** Declarative map for tooling / future checks (see CA rules in routes). */
const ROLE_PERMISSIONS = {
  super_admin: { all: true },
  company_admin: { read: '*', write: '*', except_write: [] },
  branch_manager: {
    read: 'own_branch',
    write: 'own_branch',
    except_read: ['company_settings'],
  },
  ca: {
    read: '*',
    write: 'none',
    allowed_write: ['reports_export'],
    except_read: [
      'users',
      'attendance',
      'company_settings',
      'vehicle_create',
      'vehicle_update',
      'stock_transfer',
    ],
  },
  staff: { read: 'own_branch', write: 'own_branch_limited' },
};

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Block listed roles (e.g. read-only CA on mutating routes).
 */
function requireNotRole(...blockedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (blockedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

module.exports = {
  requireRole,
  requireNotRole,
  requireMinRole,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
};
