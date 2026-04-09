const { query } = require('../config/db');

async function createLeave(req, res) {
  const { id: userId, company_id: companyId, branch_id: branchId, role } = req.user;
  const { start_date, end_date, leave_type, reason } = req.validated;

  if (role !== 'staff') {
    return res.status(403).json({ success: false, error: 'Only staff can submit leave requests' });
  }
  if (!branchId) {
    return res.status(400).json({ success: false, error: 'No branch assigned' });
  }
  if (new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({ success: false, error: 'end_date must be on or after start_date' });
  }

  const { rows } = await query(
    `INSERT INTO leave_requests (company_id, branch_id, user_id, start_date, end_date, leave_type, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [companyId, branchId, userId, start_date, end_date, leave_type || 'casual', reason || null],
  );

  res.status(201).json({ success: true, data: rows[0] });
}

async function listLeaves(req, res) {
  const { id: userId, company_id: companyId, branch_id: branchId, role } = req.user;

  if (role === 'staff') {
    const { rows } = await query(
      `SELECT lr.*, u.name AS user_name
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE lr.company_id = $1 AND lr.user_id = $2 AND lr.is_deleted = FALSE
       ORDER BY lr.created_at DESC`,
      [companyId, userId],
    );
    return res.json({ success: true, data: rows });
  }

  if (role === 'branch_manager') {
    if (!branchId) {
      return res.status(400).json({ success: false, error: 'No branch assigned' });
    }
    const { rows } = await query(
      `SELECT lr.*, u.name AS user_name, u.email AS user_email
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE lr.company_id = $1 AND lr.branch_id = $2 AND lr.is_deleted = FALSE
       ORDER BY lr.status = 'pending' DESC, lr.created_at DESC`,
      [companyId, branchId],
    );
    return res.json({ success: true, data: rows });
  }

  if (role === 'company_admin' || role === 'super_admin') {
    const { rows } = await query(
      `SELECT lr.*, u.name AS user_name, u.email AS user_email, b.name AS branch_name
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       LEFT JOIN branches b ON b.id = lr.branch_id
       WHERE lr.company_id = $1 AND lr.is_deleted = FALSE
       ORDER BY lr.status = 'pending' DESC, lr.created_at DESC`,
      [companyId],
    );
    return res.json({ success: true, data: rows });
  }

  return res.status(403).json({ success: false, error: 'Insufficient permissions' });
}

async function reviewLeave(req, res) {
  const { id: leaveId } = req.params;
  const { status, manager_note } = req.validated;
  const { id: reviewerId, company_id: companyId, branch_id: branchId, role } = req.user;

  if (role !== 'branch_manager') {
    return res.status(403).json({ success: false, error: 'Only branch managers can approve leave' });
  }
  if (!branchId) {
    return res.status(400).json({ success: false, error: 'No branch assigned' });
  }

  const { rows: existing } = await query(
    `SELECT id, branch_id, status FROM leave_requests
     WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
    [leaveId, companyId],
  );
  if (existing.length === 0) {
    return res.status(404).json({ success: false, error: 'Leave request not found' });
  }
  if (existing[0].branch_id !== branchId) {
    return res.status(403).json({ success: false, error: 'Not your branch' });
  }
  if (existing[0].status !== 'pending') {
    return res.status(400).json({ success: false, error: 'Request is no longer pending' });
  }

  const { rows } = await query(
    `UPDATE leave_requests
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), manager_note = $3, updated_at = NOW()
     WHERE id = $4 AND company_id = $5
     RETURNING *`,
    [status, reviewerId, manager_note || null, leaveId, companyId],
  );

  res.json({ success: true, data: rows[0] });
}

async function cancelLeave(req, res) {
  const { id: leaveId } = req.params;
  const { id: userId, company_id: companyId, role } = req.user;

  if (role !== 'staff') {
    return res.status(403).json({ success: false, error: 'Only staff can cancel their own pending request' });
  }

  const { rows } = await query(
    `UPDATE leave_requests
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND user_id = $3 AND status = 'pending' AND is_deleted = FALSE
     RETURNING *`,
    [leaveId, companyId, userId],
  );

  if (rows.length === 0) {
    return res.status(400).json({ success: false, error: 'Cannot cancel (not found or not pending)' });
  }

  res.json({ success: true, data: rows[0] });
}

module.exports = { createLeave, listLeaves, reviewLeave, cancelLeave };
