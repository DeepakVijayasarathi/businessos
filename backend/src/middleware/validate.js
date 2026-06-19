const { validationResult } = require('express-validator');
const { validationError } = require('../utils/response');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationError(res, errors.array());
  }
  next();
}

module.exports = { validate };
