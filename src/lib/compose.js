// node-gd 3 is an ES module (its README uses `import gd from 'node-gd'`).
// require() on an ES module returns its namespace object, and the whole API is
// on the default export. The fallback keeps working with a CommonJS build.
const gdModule = require('node-gd');
const gd = gdModule.default || gdModule;
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { inspect } = require('./imageinfo');

// Fail fast, like config.js: if node-gd doesn't offer what this file uses,
// the server refuses to start and says which function is missing,
// instead of every upload failing with a misleading error.
for (const name of ['createFromPngPtr', 'createFromJpegPtr', 'openFile', 'createTrueColor']) {
  if (typeof gd[name] !== 'function') {
    throw new Error(`node-gd: gd.${name} is not available. Check the node-gd version and how it is imported.`);
  }
}

const OUT_W = 640;
const OUT_H = 480;

// src/lib -> project root
const ROOT = path.join(__dirname, '..', '..');
const OVERLAYS_DIR = path.join(ROOT, 'public', 'overlays');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

// "The user sent a bad image" (-> 400), as opposed to a server fault (-> 500)
class ImageError extends Error {
  constructor(message, options) {
    super(message, options); // options.cause keeps the original error for debugging
    this.name = 'ImageError';
  }
}

// Decode the user's bytes. Any failure here is the file's fault, not ours.
async function decodePhoto(buffer, type) {
  let img;
  try {
    img = type === 'png'
      ? await gd.createFromPngPtr(buffer)
      : await gd.createFromJpegPtr(buffer);
  } catch (err) {
    // A TypeError means OUR code is wrong (e.g. calling something that doesn't
    // exist): a server bug, not the user's file. Let it become a logged 500.
    if (err instanceof TypeError) throw err;
    throw new ImageError('Corrupted image', { cause: err });
  }
  // Some libgd bindings return null instead of throwing on a bad file
  if (!img) throw new ImageError('Corrupted image');
  return img;
}

// photoBuffer:     raw PNG/JPEG bytes from the user
// overlayFilename: comes from the overlays table, NEVER from the client
// Returns the name of the new file inside UPLOADS_DIR.
async function composeImage(photoBuffer, overlayFilename) {
  // Check type and dimensions from the headers BEFORE decoding anything
  const info = inspect(photoBuffer);
  if (info.error) throw new ImageError(info.error);

  let photo = null;
  let overlay = null;
  let out = null;
  try {
    photo = await decodePhoto(photoBuffer, info.type);

    overlay = await gd.openFile(path.join(OVERLAYS_DIR, overlayFilename));
    if (!overlay || overlay.width !== OUT_W || overlay.height !== OUT_H) {
      // Our own asset is wrong: a server problem (500), not the user's (400)
      throw new Error(`Overlay ${overlayFilename} must be ${OUT_W}x${OUT_H}`);
    }

    out = await gd.createTrueColor(OUT_W, OUT_H);
    out.alphaBlending(1); // already the default for truecolor, explicit on purpose

    // 1. "Cover" crop: scale the photo to fill 640x480, cut the excess from the center
    const scale = Math.max(OUT_W / photo.width, OUT_H / photo.height);
    const srcW = Math.round(OUT_W / scale);
    const srcH = Math.round(OUT_H / scale);
    const srcX = Math.floor((photo.width - srcW) / 2);
    const srcY = Math.floor((photo.height - srcH) / 2);
    photo.copyResampled(out, 0, 0, srcX, srcY, OUT_W, OUT_H, srcW, srcH);

    // 2. Superpose the overlay: its transparent pixels leave the photo visible
    overlay.copy(out, 0, 0, 0, 0, OUT_W, OUT_H);

    // 3. Encode a brand new PNG under a random name. Only decoded pixels
    //    survive, so anything hidden in the uploaded file is gone.
    const filename = crypto.randomBytes(16).toString('hex') + '.png';
    const dest = path.join(UPLOADS_DIR, filename);
    await fs.mkdir(UPLOADS_DIR, { recursive: true }); // no-op when it exists
    try {
      await out.savePng(dest, 6);
    } catch (err) {
      await fs.unlink(dest).catch(() => {}); // don't leave a half-written file
      throw err;
    }
    return filename;
  } finally {
    // libgd memory is not managed by the JavaScript garbage collector
    if (photo) photo.destroy();
    if (overlay) overlay.destroy();
    if (out) out.destroy();
  }
}

module.exports = { composeImage, ImageError, UPLOADS_DIR };
