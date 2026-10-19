const controller = require('../controllers/auth');

function register(add) {
  add('POST', '/api/register', controller.register);
  add('GET', '/confirm/:token', controller.confirm);
  add('POST', '/api/login', controller.login);
  add('POST', '/api/logout', controller.logout);
  add('POST', '/api/forgot-password', controller.forgotPassword);
  add('POST', '/api/reset-password/:token', controller.resetPassword);
  add('GET', '/reset-password/:token', controller.resetPasswordPage);
}

module.exports = { register };