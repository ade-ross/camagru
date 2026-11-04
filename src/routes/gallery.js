const controller = require('../controllers/gallery');

function register(add) {
  // public: visitors see everything, but can't like or comment
  add('GET', '/api/gallery', controller.list);
  add('GET', '/api/gallery/:id', controller.getOne); // called by image.html
  add('POST', '/api/images/:id/like', controller.like, { auth: true });
  add('DELETE', '/api/images/:id/like', controller.unlike, { auth: true });
  add('POST', '/api/images/:id/comments', controller.addComment, { auth: true });
}

module.exports = { register };
