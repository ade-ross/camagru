const controller = require('../controllers/users');

function register(add) {
  add('GET', '/api/users/me', controller.getMe);
  add('PATCH', '/api/users/me', controller.updateMe);
}

module.exports = { register };