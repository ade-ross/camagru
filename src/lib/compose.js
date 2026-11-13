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

// Filters the user can choose (PHP: imagefilter() with IMG_FILTER_GRAYSCALE,
// IMG_FILTER_NEGATE, IMG_FILTER_CONTRAST). Each one changes the photo's pixels
// in place. The editor previews them with CSS (style.css, "filters"); the
// values were chosen so the preview matches (see decisions.md).
const FILTERS = {
  none: () => {},
  grayscale: (img) => img.grayscale(),
  negative: (img) => img.negate(),
  // GD's contrast factor is ((100 - n) / 100)^2, so -22.47 gives 1.5 and
  // 16.33 gives 0.7: exactly CSS contrast(1.5) and contrast(0.7)
  contrast: (img) => img.contrast(-22.47),
  faded: (img) => img.contrast(16.33),
};

// Object.hasOwn and not FILTERS[name]: every object also inherits keys like
// "constructor" or "toString", and FILTERS["constructor"] would be found too
function isFilter(name) {
  return typeof name === 'string' && Object.hasOwn(FILTERS, name);
}

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

// Sticker size limits, in percent (the editor's slider uses the same range)
const MIN_SIZE = 25;
const MAX_SIZE = 200;

// position: an object with x, y, size from the client (the sticker object).
// x/y: where the sticker's center goes on the 640x480 result; size: percent.
// All integers, so no rounding questions. The center must stay on the
// picture, so a sticker can't be lost off-screen. Returns true if valid.
function isValidPosition(position) {
  if (typeof position !== 'object' || position === null) return false;
  const { x, y, size } = position;
  return Number.isInteger(x) && x >= 0 && x <= OUT_W
    && Number.isInteger(y) && y >= 0 && y <= OUT_H
    && Number.isInteger(size) && size >= MIN_SIZE && size <= MAX_SIZE;
}

// Opens one of our overlay files. Its size is checked here, so the drawing
// code can rely on 640x480.
async function openOverlay(filename) {
  const layer = await gd.openFile(path.join(OVERLAYS_DIR, filename));
  if (!layer || layer.width !== OUT_W || layer.height !== OUT_H) {
    if (layer) layer.destroy();
    // Our own asset is wrong: a server problem (500), not the user's (400)
    throw new Error(`Overlay ${filename} must be ${OUT_W}x${OUT_H}`);
  }
  return layer;
}

// Draws a sticker's layer on out. The whole 640x480 layer is scaled by s
// around the sticker's center (cx, cy), then moved so that center lands on
// (x, y): a point p of the file ends up at (p - c) * s + target. The editor's
// CSS preview uses the same formula. Parts outside the picture are cut off.
function drawSticker(out, layer, sticker) {
  const s = sticker.size / 100;
  const dstX = Math.round(sticker.x - sticker.overlay.center_x * s);
  const dstY = Math.round(sticker.y - sticker.overlay.center_y * s);
  // PHP: imagecopyresampled. Smooth scaling, and the alpha is kept.
  layer.copyResampled(out, dstX, dstY, 0, 0,
    Math.round(OUT_W * s), Math.round(OUT_H * s), OUT_W, OUT_H);
}

// photoBuffer: raw PNG/JPEG bytes from the user
// filter:      a FILTERS key, already checked with isFilter()
// frame:       null, or a frame's row of the overlays table
// sticker:     null, or { overlay: a sticker's row, x, y, size } (checked with
//              isValidPosition). The rows come from the DB, NEVER from the client.
// At least one of frame and sticker (the controller makes sure).
// Returns the name of the new file inside UPLOADS_DIR.
async function composeImage(photoBuffer, filter, frame, sticker) {
  // Check type and dimensions from the headers BEFORE decoding anything
  const info = inspect(photoBuffer);
  if (info.error) throw new ImageError(info.error);

  let photo = null;
  let stickerLayer = null; // decoded pixels of the overlay files
  let frameLayer = null;
  let out = null;
  try {
    photo = await decodePhoto(photoBuffer, info.type);
    if (sticker) stickerLayer = await openOverlay(sticker.overlay.filename);
    if (frame) frameLayer = await openOverlay(frame.filename);

    out = await gd.createTrueColor(OUT_W, OUT_H);
    out.alphaBlending(1); // already the default for truecolor, explicit on purpose

    // 1. "Cover" crop: scale the photo to fill 640x480, cut the excess from the center
    const scale = Math.max(OUT_W / photo.width, OUT_H / photo.height);
    const srcW = Math.round(OUT_W / scale);
    const srcH = Math.round(OUT_H / scale);
    const srcX = Math.floor((photo.width - srcW) / 2);
    const srcY = Math.floor((photo.height - srcH) / 2);
    photo.copyResampled(out, 0, 0, srcX, srcY, OUT_W, OUT_H, srcW, srcH);

    // 2. The filter, BEFORE the overlays: it changes the photo only, the
    //    overlays keep their own colors (like the preview)
    FILTERS[filter](out);

    // 3. The sticker, then the frame ON TOP, like a framed photo: a sticker
    //    pushed to the edge goes under the frame's border. Transparent pixels
    //    leave what's below visible. Same order as the layers in the preview.
    if (sticker) drawSticker(out, stickerLayer, sticker);
    if (frame) frameLayer.copy(out, 0, 0, 0, 0, OUT_W, OUT_H);

    // 4. Encode a brand new PNG under a random name. Only decoded pixels
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
    if (stickerLayer) stickerLayer.destroy();
    if (frameLayer) frameLayer.destroy();
    if (out) out.destroy();
  }
}

module.exports = { composeImage, isFilter, isValidPosition, ImageError, UPLOADS_DIR };
