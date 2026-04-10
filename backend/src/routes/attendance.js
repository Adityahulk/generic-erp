const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { requireNotRole, requireRole } = require('../middleware/role');
const {
  clockIn,
  clockOut,
  myStatus,
  todayByBranch,
  report,
  myMonthly,
  branchMonthly,
  regularize,
} = require('../controllers/attendanceController');
const {
  leaveApply,
  leaveMy,
  leavePending,
  leaveApprove,
  leaveReject,
  leaveCancel,
  leaveListAll,
} = require('../controllers/attendanceLeaveController');

const router = Router();

router.use(verifyToken);
router.use(requireNotRole('ca'));

router.post('/clockin', clockIn);
router.post('/clock-in', clockIn);
router.post('/clockout', clockOut);
router.post('/clock-out', clockOut);
router.get('/me', myStatus);
router.get('/today', myStatus);
router.get('/my', myMonthly);

router.get('/today/:branchId', todayByBranch);
router.get('/branch/:branchId/today', todayByBranch);
router.get('/branch/:branchId', branchMonthly);

router.get('/report', report);

router.post(
  '/regularize',
  requireRole('branch_manager', 'company_admin', 'super_admin'),
  regularize,
);

router.post('/leave/apply', leaveApply);
router.get('/leave/my', leaveMy);
router.get(
  '/leave/pending',
  requireRole('branch_manager', 'company_admin', 'super_admin'),
  leavePending,
);
router.get(
  '/leave/all',
  requireRole('branch_manager', 'company_admin', 'super_admin'),
  leaveListAll,
);
router.patch(
  '/leave/:id/approve',
  requireRole('branch_manager', 'company_admin', 'super_admin'),
  leaveApprove,
);
router.patch(
  '/leave/:id/reject',
  requireRole('branch_manager', 'company_admin', 'super_admin'),
  leaveReject,
);
router.patch('/leave/:id/cancel', leaveCancel);

module.exports = router;
