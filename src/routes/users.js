const controller = require('../controllers/users');

function register(add) {
  add('GET', '/api/users/me', controller.getMe);
  add('PATCH', '/api/users/me', controller.updateMe);
  add('GET', '/confirm-email/:token', controller.confirmEmail);
}

module.exports = { register };