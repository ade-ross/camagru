const controller = require('../controllers/images');

function register(add) {
  add('GET', '/api/overlays', controller.listOverlays);
  add('GET', '/api/images', controller.listMine);
  add('POST', '/api/images', controller.create);
  add('DELETE', '/api/images/:id', controller.remove);
  add('GET', '/uploads/:filename', controller.serveUpload);
}

module.exports = { register };
