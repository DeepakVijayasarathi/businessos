const xss = require('xss');

// NOTE: This middleware is intentionally NOT wired globally in server.js.
// Wiring it globally would strip HTML from legitimate rich-text fields
// (e.g. email template bodies in modules/email which intentionally contain
// markup like <h1>...</h1>). Apply `sanitizeBody` selectively, per-route,
// to endpoints that accept free-text user input with no legitimate HTML
// use case (e.g. leads, contacts, helpdesk tickets/comments, notes).
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const sanitizeValue = (val) => {
      if (typeof val === 'string') return xss(val, { whiteList: {}, stripIgnoreTag: true });
      if (Array.isArray(val)) return val.map(sanitizeValue);
      if (val && typeof val === 'object') return sanitizeObject(val);
      return val;
    };
    const sanitizeObject = (obj) => {
      const out = {};
      for (const key of Object.keys(obj)) {
        out[key] = sanitizeValue(obj[key]);
      }
      return out;
    };
    req.body = sanitizeObject(req.body);
  }
  next();
}

module.exports = { sanitizeBody };
