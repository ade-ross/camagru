const controller = require('../controllers/users');

function register(add) {
  add('GET', '/api/users/me', controller.getMe, { auth: true });
  add('PATCH', '/api/users/me', controller.updateMe, { auth: true });
  add('POST', '/api/confirm-email/:token', controller.confirmEmail); // called by confirm-email.html
}

module.exports = { register };
