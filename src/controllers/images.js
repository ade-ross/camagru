const fs = require('fs');
const path = require('path');
const imagesModel = require('../models/images');
const overlaysModel = require('../models/overlays');
const { composeImage, isFilter, isValidPosition, ImageError, UPLOADS_DIR } = require('../lib/compose');
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

// body: { photo: "data:image/png;base64,....", filter: "grayscale",
//         frameId: 1, sticker: { id: 8, x: 320, y: 240, size: 100 } }
// A frame, a sticker, or both (the subject: at least one superposable image).
// filter is optional: missing means "none".
async function create(req, res) {
  if (!requireAuth(req, res)) return;

  const { photo, filter = 'none', frameId = null, sticker = null } = req.body;
  if (frameId === null && sticker === null) {
    return sendJson(res, 400, { error: 'Choose a frame or a sticker first' });
  }
  if (frameId !== null && !Number.isInteger(frameId)) {
    return sendJson(res, 400, { error: 'Invalid frame' });
  }
  if (sticker !== null && !(isValidPosition(sticker) && Number.isInteger(sticker.id))) {
    return sendJson(res, 400, { error: 'Invalid sticker' });
  }
  if (!isFilter(filter)) {
    return sendJson(res, 400, { error: 'Unknown filter' });
  }
  const buffer = dataUrlToBuffer(photo);
  if (!buffer || buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) {
    return sendJson(res, 400, { error: 'Invalid or too large image' });
  }

  try {
    let frame = null;
    if (frameId !== null) {
      frame = await overlaysModel.findFrame(frameId);
      if (!frame) return sendJson(res, 404, { error: 'Unknown frame' });
    }
    let placed = null; // the sticker's DB row + where the user put it
    if (sticker !== null) {
      const overlay = await overlaysModel.findSticker(sticker.id);
      if (!overlay) return sendJson(res, 404, { error: 'Unknown sticker' });
      // only the checked numbers are passed on, not the client's whole object
      placed = { overlay, x: sticker.x, y: sticker.y, size: sticker.size };
    }
    const filename = await composeImage(buffer, filter, frame, placed);

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
