// =============================================
// roles.js - Shared Role Middleware
// =============================================

const OFFICER_ROLES  = ['admin', 'governor', 'cashier', 'officer'];
const GOVERNOR_ROLES = ['admin', 'governor'];

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}

function requireGovernorOrAdmin(req, res, next) {
  if (!GOVERNOR_ROLES.includes(req.profile?.role)) {
    return res.status(403).json({ error: 'Governor or Admin privileges required.' });
  }
  next();
}

function requireOfficer(req, res, next) {
  if (!OFFICER_ROLES.includes(req.profile?.role)) {
    return res.status(403).json({ error: 'Officer privileges required.' });
  }
  next();
}

module.exports = { OFFICER_ROLES, GOVERNOR_ROLES, requireAdmin, requireGovernorOrAdmin, requireOfficer };

