const { Router } = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const authController = require('../controllers/authController');

const router = Router();

const loginSchema = z.object({
  email: z
    .string()
    .email('Valid email required')
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

router.post('/login', validateBody(loginSchema), asyncHandler(authController.login));
router.post('/refresh', validateBody(refreshSchema), asyncHandler(authController.refresh));
router.post('/logout', verifyToken, asyncHandler(authController.logout));
router.get('/me', verifyToken, asyncHandler(authController.me));

module.exports = router;
