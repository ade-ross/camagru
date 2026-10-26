const controller = require('../controllers/images');

function register(add) {
  add('GET', '/api/overlays', controller.listOverlays);
  add('GET', '/api/images', controller.listMine, { auth: true });
  add('POST', '/api/images', controller.create, { auth: true });
  add('DELETE', '/api/images/:id', controller.remove, { auth: true });
  add('GET', '/uploads/:filename', controller.serveUpload);
}

module.exports = { register };
