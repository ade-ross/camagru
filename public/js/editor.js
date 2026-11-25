import { api } from './api.js';
import { currentUser } from './layout.js';
import { showMessage } from './ui.js';
import { loadMyPictures, addPicture } from './my-pictures.js';

const editor = document.getElementById('editor');
const needLogin = document.getElementById('need-login');
const pageMessage = document.getElementById('page-message');

const preview = document.getElementById('preview');
const previewEmpty = document.getElementById('preview-empty');
const video = document.getElementById('video');
const uploadPreview = document.getElementById('upload-preview');
const previewSticker = document.getElementById('preview-sticker');
const previewFrame = document.getElementById('preview-frame');

const fileInput = document.getElementById('file-input');
const useWebcam = document.getElementById('use-webcam');
const filterList = document.getElementById('filters');

const frameList = document.getElementById('frames');
const stickerList = document.getElementById('stickers');
const stickerControls = document.getElementById('sticker-controls');
const stickerSize = document.getElementById('sticker-size');
const capture = document.getElementById('capture');
const captureMessage = document.getElementById('capture-message');

// The result is 640x480: a bigger upload would only cost transfer time and server CPU
const MAX_UPLOAD_SIDE = 1280;
// The server's result size: sticker positions are in these pixels, whatever
// the size of the preview on screen
const OUT_W = 640;
const OUT_H = 480;

// { id, filename, label, center_x, center_y } from /api/overlays, or null
let selectedFrame = null;
let selectedSticker = null;
let stickerPos = null;      // { x, y, size } while a sticker is selected
let source = null;          // what the button would photograph: 'webcam', 'upload' or null
let webcamRunning = false;
let uploadedPhoto = null;   // the uploaded file, redrawn as a JPEG data URL
let saving = false;         // a picture is being sent

// Visitors get the polite message and nothing else: no camera request,
// no /api/images call (it would answer 401)
currentUser.then((user) => {
  if (!user) {
    needLogin.hidden = false;
    return;
  }
  editor.hidden = false;
  // all three catch their own errors, so their promises can't reject unhandled
  loadOverlays();
  loadMyPictures();
  startWebcam();
});

// ---------- picture source: webcam or upload ----------

// The only place that changes the source: shows the matching layer of the
// preview and keeps the buttons in sync
function showSource(name) {
  source = name;
  previewEmpty.hidden = name !== null;
  video.hidden = name !== 'webcam';
  uploadPreview.hidden = name !== 'upload';
  useWebcam.hidden = !(name === 'upload' && webcamRunning);
  updateCaptureButton();
}

// What to tell the user for each getUserMedia error name
const WEBCAM_ERRORS = {
  NotAllowedError: 'Webcam access was refused. Allow it from the icon in the address bar, or upload a picture instead.',
  NotFoundError: 'No webcam found: you can upload a picture instead.',
  NotReadableError: 'The webcam is busy (another application is using it). Close it and reload, or upload a picture instead.',
};

async function startWebcam() {
  // navigator.mediaDevices only exists in a "secure context": https://, or
  // http://localhost. Opened as http://<ip>:3000 from another machine, it is undefined.
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    previewEmpty.textContent = 'The webcam needs https or localhost: you can upload a picture instead.';
    return;
  }

  let stream;
  try {
    // facingMode 'user': the front camera on a phone. The browser asks for permission here.
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play(); // resolves once frames are flowing, so a capture won't be empty
  } catch (err) {
    // play() failed after the camera opened: release it, or its light stays on
    if (stream) stream.getTracks().forEach((track) => track.stop());
    previewEmpty.textContent = WEBCAM_ERRORS[err.name] || 'The webcam could not start: you can upload a picture instead.';
    return;
  }

  // e.g. a USB webcam unplugged while the page is open
  stream.getVideoTracks()[0].addEventListener('ended', () => {
    webcamRunning = false;
    previewEmpty.textContent = 'The webcam stopped: reload the page, or upload a picture instead.';
    showSource(source === 'webcam' ? null : source);
  });

  webcamRunning = true;
  // the user may have uploaded a file while the permission prompt was open: keep it
  showSource(source === null ? 'webcam' : source);
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return; // the file picker was closed without choosing
  captureMessage.hidden = true;
  try {
    uploadedPhoto = await fileToPhoto(file);
  } catch (err) {
    fileInput.value = ''; // so choosing the same file again fires "change" again
    showMessage(captureMessage, err.message, 'error');
    return; // a previous upload, if any, stays in the preview
  }
  uploadPreview.src = uploadedPhoto; // the preview shows exactly what will be sent
  showSource('upload');
});

useWebcam.addEventListener('click', () => {
  fileInput.value = '';
  showSource('webcam');
});

// Redraws an uploaded file on a canvas and returns it as a JPEG data URL.
//  - Only PNG/JPEG: `accept` on the input is just a hint, the picker can show all files.
//  - A file that isn't really an image fails here, in the browser, so the
//    server's image library never gets one (see decisions.md, libgd warnings).
//  - The browser applies the photo's EXIF rotation when drawing, so phone
//    pictures come out the right way up.
//  - White background: JPEG has no transparency, transparent PNG areas would turn black.
//  - At most MAX_UPLOAD_SIDE px on the longest side.
async function fileToPhoto(file) {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    throw new Error('Choose a PNG or JPEG picture.');
  }
  const url = URL.createObjectURL(file); // a temporary local URL for the file: nothing is uploaded
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode(); // resolves when the image is loaded and decoded
    } catch {
      throw new Error('This file is not a valid picture.');
    }

    const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height); // drawn scaled to the canvas size
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url); // free the memory the browser holds for that URL
  }
}

// ---------- rows of choices: filter, frame, sticker ----------

// The three rows behave the same: at most one button pressed, nothing at the
// start, clicking the chosen one again removes it. aria-pressed makes them
// toggle buttons: screen readers say "pressed", and the CSS uses the same
// attribute for the highlight.
// One listener per row, also for buttons added later: closest() finds the
// button even when the click lands on its picture or label.
// onChoose(button) gets the chosen button, or null when there is none any more.
function onChoice(row, onChoose) {
  row.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return; // a click in the gap between buttons
    const wasChosen = button.getAttribute('aria-pressed') === 'true';
    const previous = row.querySelector('[aria-pressed="true"]');
    if (previous) previous.setAttribute('aria-pressed', 'false');
    if (wasChosen) {
      onChoose(null);
      return;
    }
    button.setAttribute('aria-pressed', 'true');
    onChoose(button);
  });
}

// Filter: preview only, the CSS shows it on the video/upload. The photo is sent
// unfiltered with the filter's name, and the server applies it. The box gets
// the same data-filter as the button: the CSS does the rest.
onChoice(filterList, (button) => {
  preview.dataset.filter = button ? button.dataset.filter : 'none';
});

const overlaysById = new Map(); // id -> overlay, to find a button's overlay
const overlayOf = (button) => (button ? overlaysById.get(Number(button.dataset.id)) : null);
onChoice(frameList, (button) => selectFrame(overlayOf(button)));
onChoice(stickerList, (button) => selectSticker(overlayOf(button)));

// ---------- overlays ----------

async function loadOverlays() {
  let overlays;
  try {
    overlays = await api('GET', '/api/overlays');
  } catch (err) {
    showMessage(pageMessage, err.message, 'error');
    return;
  }
  for (const overlay of overlays) {
    overlaysById.set(overlay.id, overlay);
    // a sticker has a center (the point it is moved by); a frame doesn't
    const row = overlay.center_x === null ? frameList : stickerList;
    row.append(overlayButton(overlay));
  }
}

function overlayButton(overlay) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice';
  button.dataset.id = overlay.id;
  button.setAttribute('aria-pressed', 'false');

  const img = document.createElement('img');
  img.src = `/overlays/${overlay.filename}`;
  img.alt = ''; // the label under it already names it
  const label = document.createElement('span');
  label.textContent = overlay.label;

  button.append(img, label);
  return button;
}

// Shows an overlay's file in one preview layer, or hides the layer (null)
function showLayer(img, overlay) {
  if (overlay) img.src = `/overlays/${overlay.filename}`;
  img.hidden = overlay === null;
}

function selectFrame(frame) {
  selectedFrame = frame;
  showLayer(previewFrame, frame);
  updateCaptureButton();
}

function selectSticker(sticker) {
  selectedSticker = sticker;
  // a sticker starts where its file draws it (its center), at 100%
  stickerPos = sticker ? { x: sticker.center_x, y: sticker.center_y, size: 100 } : null;
  stickerSize.value = 100;
  stickerControls.hidden = sticker === null;
  preview.classList.toggle('movable', sticker !== null);
  showLayer(previewSticker, sticker);
  showSticker();
  updateCaptureButton();
}

// ---------- sticker: move and resize ----------

// Preview only, in CSS. The server draws the same thing (compose.js drawSticker):
// the 640x480 layer scaled by s around the sticker's center c, then moved so c
// lands on (x, y). transform-origin = c, then translate(target - c) scale(s).
// Percentages in translate() are of the image's own size, which is the box's:
// the same numbers work whatever the preview's size on screen.
function showSticker() {
  if (!selectedSticker) {
    previewSticker.style.transform = '';
    previewSticker.style.transformOrigin = '';
    return;
  }
  const cx = selectedSticker.center_x;
  const cy = selectedSticker.center_y;
  const dx = ((stickerPos.x - cx) / OUT_W) * 100;
  const dy = ((stickerPos.y - cy) / OUT_H) * 100;
  previewSticker.style.transformOrigin = `${(cx / OUT_W) * 100}% ${(cy / OUT_H) * 100}%`;
  previewSticker.style.transform = `translate(${dx}%, ${dy}%) scale(${stickerPos.size / 100})`;
}

// Three ways to resize: the slider, the mouse wheel and a two-finger pinch.
// All go through here. The size range is the slider's min/max in the HTML
// (the same as the server accepts). Not rounded here: a wheel or a pinch
// changes it by small steps that rounding would swallow (99.6 -> 100 again
// and again). It is rounded when the picture is sent.
function setStickerSize(value) {
  stickerPos.size = clamp(value, Number(stickerSize.min), Number(stickerSize.max));
  stickerSize.value = stickerPos.size; // the slider follows (it shows the nearest step)
  showSticker();
}

// "input" fires continuously while the slider moves ("change" only on release)
stickerSize.addEventListener('input', () => {
  setStickerSize(Number(stickerSize.value));
});

// Mouse wheel (or trackpad scroll) over the picture resizes the sticker, and
// the page doesn't scroll meanwhile. Without a sticker the page scrolls as usual.
// passive: false = we promise the browser we may call preventDefault(); it
// then waits for us before scrolling.
preview.addEventListener('wheel', (event) => {
  if (!selectedSticker) return;
  event.preventDefault();
  // deltaY: how far the wheel turned, usually in pixels (one notch ~100), but
  // in lines for some mouse setups in Firefox: ~40px per line. Wheel up
  // (negative) = bigger; one notch = 5%, a trackpad gives many small steps.
  const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 40 : event.deltaY;
  setStickerSize(stickerPos.size - pixels / 20);
}, { passive: false });

// Drag and pinch with Pointer Events: one API for mouse, finger and pen, and
// each finger is a separate pointer with its own pointerId.
//  - one pointer down: drag. It works anywhere on the picture and moves the
//    sticker by the same amount, so a finger doesn't have to cover it.
//  - two fingers down: pinch. Fingers twice as far apart = sticker twice as big.
const pointers = new Map(); // pointerId -> { x, y }: the pointers down on the picture
let drag = null;  // { startX, startY, fromX, fromY } while one pointer drags
let pinch = null; // { startDistance, startSize } while two fingers pinch

function startDrag(point) {
  drag = { startX: point.x, startY: point.y, fromX: stickerPos.x, fromY: stickerPos.y };
}

// distance between the two fingers, in screen pixels (at least 1: we divide by it)
function fingerDistance() {
  const [a, b] = pointers.values();
  return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}

preview.addEventListener('pointerdown', (event) => {
  if (!selectedSticker || pointers.size >= 2) return; // nothing to move, or a third finger
  event.preventDefault(); // no text selection while dragging with the mouse
  // keep receiving this pointer's moves even when it leaves the box
  preview.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) {
    startDrag(pointers.get(event.pointerId));
  } else {
    // a second finger: the drag stops, the pinch starts from the current size
    drag = null;
    pinch = { startDistance: fingerDistance(), startSize: stickerPos.size };
  }
});

preview.addEventListener('pointermove', (event) => {
  const point = pointers.get(event.pointerId);
  // not a pointer we follow (e.g. the mouse just passing over), or the
  // sticker was removed meanwhile
  if (!point || !selectedSticker) return;
  point.x = event.clientX;
  point.y = event.clientY;

  if (pinch) {
    setStickerSize(pinch.startSize * (fingerDistance() / pinch.startDistance));
  } else if (drag) {
    const ratio = OUT_W / preview.clientWidth; // screen pixels -> result pixels
    // clamped like the server checks: the center stays on the picture
    stickerPos.x = clamp(Math.round(drag.fromX + (point.x - drag.startX) * ratio), 0, OUT_W);
    stickerPos.y = clamp(Math.round(drag.fromY + (point.y - drag.startY) * ratio), 0, OUT_H);
    showSticker();
  }
});

// pointercancel: e.g. the browser took over the touch, or a call came in
function endPointer(event) {
  if (!pointers.delete(event.pointerId)) return; // not one we follow
  drag = null;
  pinch = null;
  // one finger lifted after a pinch, the other still down: it drags from where
  // it is now (starting from its old start point would make the sticker jump)
  if (pointers.size === 1) startDrag(pointers.values().next().value);
}
preview.addEventListener('pointerup', endPointer);
preview.addEventListener('pointercancel', endPointer);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ---------- capture ----------

// The subject: disabled until a superposable image (frame or sticker) is
// selected. Also needs a source, and stays disabled while a picture is being
// sent (one at a time).
function updateCaptureButton() {
  capture.disabled = saving || !((selectedFrame || selectedSticker) && source);
  if (saving) capture.textContent = 'Saving…';
  else capture.textContent = source === 'upload' ? 'Save the picture' : 'Take the picture';
}

capture.addEventListener('click', takePicture);

async function takePicture() {
  saving = true;
  updateCaptureButton();
  captureMessage.hidden = true;
  try {
    const image = await api('POST', '/api/images', {
      photo: source === 'upload' ? uploadedPhoto : videoFrame(),
      filter: preview.dataset.filter,
      frameId: selectedFrame ? selectedFrame.id : null,
      sticker: selectedSticker
        // the server wants whole numbers (see setStickerSize)
        ? { id: selectedSticker.id, x: stickerPos.x, y: stickerPos.y, size: Math.round(stickerPos.size) }
        : null,
    });
    addPicture(image);
    // on a phone "My pictures" is below, maybe off screen: say it worked here too
    showMessage(captureMessage, 'Saved! It is now in My pictures.', 'success');
  } catch (err) {
    showMessage(captureMessage, err.message, 'error');
  } finally {
    saving = false;
    updateCaptureButton(); // the source may have changed meanwhile
  }
}

// The current video frame as a JPEG data URL, mirrored like the preview
// (the CSS mirror only changes the display, not the video data).
// Full camera resolution: the server does the crop to 640x480, so that logic
// exists in one place only. JPEG is about 10x smaller than PNG for a photo,
// and the server re-encodes the result as a new PNG anyway.
function videoFrame() {
  const canvas = document.createElement('canvas'); // never added to the page
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  // mirror: move the origin to the right edge, then flip the x axis
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.9);
}
