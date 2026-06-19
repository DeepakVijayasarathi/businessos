const { body } = require('express-validator');
const { validate } = require('../../middleware/validate');
const authService = require('./auth.service');
const emailService = require('../../services/email.service');
const { success, error } = require('../../utils/response');

const registerValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('companyName').trim().notEmpty().withMessage('Company name is required'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

function setAccessTokenCookie(res, accessToken) {
  res.cookie('bos_access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
  });
}

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    // Send verification email (non-blocking)
    emailService.sendWelcomeEmail(result.user).catch(() => {});
    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // Set access token as httpOnly cookie
    setAccessTokenCookie(res, result.accessToken);
    return res.status(201).json({ success: true, message: 'Registration successful', data: result });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // Set access token as httpOnly cookie
    setAccessTokenCookie(res, result.accessToken);
    return success(res, { user: result.user, accessToken: result.accessToken }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const token = req.cookies.refreshToken || req.body.refreshToken;
    if (!token) return error(res, 'No refresh token', 401);
    const tokens = await authService.refreshToken(token);
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // Set access token as httpOnly cookie
    setAccessTokenCookie(res, tokens.accessToken);
    return success(res, { accessToken: tokens.accessToken }, 'Token refreshed');
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.userId);
    res.clearCookie('refreshToken');
    res.clearCookie('bos_access_token');
    return success(res, {}, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const data = await authService.forgotPassword(req.body.email);
    if (data) {
      emailService.sendPasswordResetEmail(data).catch(() => {});
    }
    return success(res, {}, 'If the email exists, a reset link has been sent');
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    return success(res, {}, 'Password reset successfully');
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    await authService.changePassword(req.userId, req.body.currentPassword, req.body.newPassword);
    return success(res, {}, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const user = await authService.getProfile(req.userId);
    return success(res, user);
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const prisma = require('../../config/prisma');
    const { firstName, lastName, phone, avatar, timezone, language, preferences } = req.body;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { firstName, lastName, phone, avatar, timezone, language, preferences },
    });
    return success(res, authService._sanitizeUser(user), 'Profile updated');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerValidation,
  loginValidation,
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
  updateProfile,
  validate,
};
