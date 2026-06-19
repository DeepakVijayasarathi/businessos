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

router.post('/register', c.registerValidation, c.validate, c.register);
router.post('/login', c.loginValidation, c.validate, c.login);
router.post('/refresh-token', c.refreshToken);
router.post('/logout', authenticate, c.logout);
router.post('/forgot-password', forgotPasswordLimiter, c.forgotPassword);
router.post('/reset-password', c.resetPassword);
router.post('/change-password', authenticate, c.changePassword);
router.get('/me', authenticate, c.getProfile);
router.put('/me', authenticate, c.updateProfile);

module.exports = router;
