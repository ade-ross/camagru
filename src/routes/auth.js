const controller = require('../controllers/auth');

// Links in emails point to frontend PAGES (confirm.html, reset-password.html),
// never straight at the API. The page's JavaScript calls these POST routes and
// shows the result. Two reasons:
//  - a page can show a proper message when a link is invalid or already used;
//  - mail scanners that "open" every link in an email only make GET requests and
//    don't run JavaScript, so they can't use up a token by accident.
function register(add) {
  add('POST', '/api/register', controller.register);
  add('POST', '/api/confirm/:token', controller.confirm);
  add('POST', '/api/login', controller.login);
  add('POST', '/api/logout', controller.logout);
  add('POST', '/api/forgot-password', controller.forgotPassword);
  add('POST', '/api/reset-password/:token', controller.resetPassword);
}

module.exports = { register };
