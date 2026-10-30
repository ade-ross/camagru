const fs = require('fs');
const path = require('path');
const imagesModel = require('../models/images');
const overlaysModel = require('../models/overlays');
const { composeImage, ImageError, UPLOADS_DIR } = require('../lib/compose');
const { dataUrlToBuffer } = require('../lib/imageinfo');
const { requireAuth } = require('../middleware/session');
const { sendJson, sendFile } = require('../lib/http');
const log = require('../lib/log');

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const IMAGE_ID = /^\d{1,9}$/;              // 9 digits always fit a Postgres integer
const UPLOAD_NAME = /^[a-f0-9]{32}\.png$/; // only names we generate ourselves

async function listOverlays(req, res) {
  try {
    return sendJson(res, 200, await overlaysModel.listAll());
  } catch (err) {
    log.error('ListOverlays error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// The logged-in user's own images (the thumbnails in the side panel)
async function listMine(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    return sendJson(res, 200, await imagesModel.listByUser(req.user.id));
  } catch (err) {
    log.error('ListMine error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// body: { photo: "data:image/png;base64,....", overlayId: 3 }
async function create(req, res) {
  if (!requireAuth(req, res)) return;

  const { photo, overlayId } = req.body;
  if (!Number.isInteger(overlayId)) {
    return sendJson(res, 400, { error: 'Choose an overlay first' });
  }
  const buffer = dataUrlToBuffer(photo);
  if (!buffer || buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) {
    return sendJson(res, 400, { error: 'Invalid or too large image' });
  }

  try {
    const overlay = await overlaysModel.findById(overlayId);
    if (!overlay) {
      return sendJson(res, 404, { error: 'Unknown overlay' });
    }
    const filename = await composeImage(buffer, overlay.filename);

    let image;
    try {
      image = await imagesModel.createImage(req.user.id, filename);
    } catch (err) {
      // File is on disk but has no DB row: remove it, then let the outer catch respond
      fs.promises.unlink(path.join(UPLOADS_DIR, filename)).catch(() => {});
      throw err;
    }

    return sendJson(res, 201, image);
  } catch (err) {
    if (err instanceof ImageError) {
      // The user's fault (400), but log why: a wrongly rejected image
      // would otherwise be invisible to us.
      if (err.cause) log.warn('Image rejected:', err.cause.message);
      return sendJson(res, 400, { error: err.message });
    }
    log.error('Create image error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function remove(req, res, params) {
  if (!requireAuth(req, res)) return;
  if (!IMAGE_ID.test(params.id)) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  try {
    const deleted = await imagesModel.deleteOwned(Number(params.id), req.user.id);
    // Same 404 whether it doesn't exist or belongs to someone else:
    // the answer must not reveal which ids exist.
    if (!deleted) {
      return sendJson(res, 404, { error: 'Not found' });
    }
    // The row is gone, so for the user the image IS deleted. If the file
    // can't be removed, that's our problem to log, not a failure to report.
    await fs.promises.unlink(path.join(UPLOADS_DIR, deleted.filename)).catch((err) => {
      if (err.code !== 'ENOENT') log.error('Could not remove', deleted.filename, err);
    });
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    log.error('Delete image error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// GET /uploads/:filename (public: the gallery needs it)
async function serveUpload(req, res, params) {
  if (!UPLOAD_NAME.test(params.filename)) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  const sent = await sendFile(res, path.join(UPLOADS_DIR, params.filename), {
    'Content-Type': 'image/png',
    // Safe to cache: a filename is never reused for different content
    'Cache-Control': 'public, max-age=86400',
  });
  if (!sent) return sendJson(res, 404, { error: 'Not found' });
}

module.exports = { listOverlays, listMine, create, remove, serveUpload };
