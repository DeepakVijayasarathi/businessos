const crypto = require('crypto');
const { encryptionKey } = require('../config');

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt a string value
 */
function encrypt(text) {
  if (!text || !encryptionKey) return text;
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 */
function decrypt(text) {
  if (!text || !encryptionKey) return text;
  try {
    const [ivHex, authTagHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return text;
  }
}

/**
 * Generate a random token
 */
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Slugify a string
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Paginate helper
 */
function paginate(page = 1, limit = 20) {
  const take = Math.min(parseInt(limit), 100);
  const skip = (Math.max(parseInt(page), 1) - 1) * take;
  return { take, skip };
}

/**
 * Format pagination meta
 */
function paginateMeta(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages,
    hasNextPage: parseInt(page) < totalPages,
    hasPrevPage: parseInt(page) > 1,
  };
}

/**
 * Generate invoice/ticket number
 */
function generateNumber(prefix, count) {
  return `${prefix}-${String(count).padStart(5, '0')}`;
}

/**
 * Safe JSON parse
 */
function safeJsonParse(str, fallback = {}) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return fallback;
  }
}

/**
 * Pick allowed fields from object
 */
function pick(obj, keys) {
  return keys.reduce((acc, key) => {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
}

/**
 * Omit fields from object
 */
function omit(obj, keys) {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keys.includes(k))
  );
}

module.exports = {
  encrypt,
  decrypt,
  generateToken,
  slugify,
  paginate,
  paginateMeta,
  generateNumber,
  safeJsonParse,
  pick,
  omit,
};
