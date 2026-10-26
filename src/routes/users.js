const controller = require('../controllers/users');

function register(add) {
  add('GET', '/api/users/me', controller.getMe);
  add('PATCH', '/api/users/me', controller.updateMe);
  add('POST', '/api/confirm-email/:token', controller.confirmEmail); // called by confirm-email.html
}

module.exports = { register };
