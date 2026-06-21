const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour per IP
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter than the global auth limiter, keyed by email+IP so a credential-
// stuffing run against one account gets capped even if the attacker rotates
// IPs slower than this window, without penalizing other users on a shared IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body?.email || '').toLowerCase()}`,
});

router.post('/register', c.registerValidation, c.validate, c.register);
router.post('/login', loginLimiter, c.loginValidation, c.validate, c.login);
router.post('/refresh-token', c.refreshToken);
router.post('/logout', authenticate, c.logout);
router.post('/forgot-password', forgotPasswordLimiter, c.forgotPassword);
router.post('/reset-password', forgotPasswordLimiter, c.resetPassword);
router.post('/change-password', authenticate, c.changePassword);
router.get('/me', authenticate, c.getProfile);
router.put('/me', authenticate, c.updateProfile);

module.exports = router;
