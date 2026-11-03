import { api } from './api.js';
import { currentUser } from './layout.js';
import { showMessage } from './ui.js';
import { loadMyPictures, addPicture } from './my-pictures.js';

const editor = document.getElementById('editor');
const needLogin = document.getElementById('need-login');
const pageMessage = document.getElementById('page-message');

const previewEmpty = document.getElementById('preview-empty');
const video = document.getElementById('video');
const uploadPreview = document.getElementById('upload-preview');
const previewOverlay = document.getElementById('preview-overlay');

const fileInput = document.getElementById('file-input');
const useWebcam = document.getElementById('use-webcam');

const overlayList = document.getElementById('overlays');
const capture = document.getElementById('capture');
const captureMessage = document.getElementById('capture-message');

// The result is 640x480: a bigger upload would only cost transfer time and server CPU
const MAX_UPLOAD_SIDE = 1280;

let selectedOverlay = null; // { id, filename, label } from /api/overlays
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

// ---------- overlays ----------

async function loadOverlays() {
  let overlays;
  try {
    overlays = await api('GET', '/api/overlays');
  } catch (err) {
    showMessage(pageMessage, err.message, 'error');
    return;
  }
  for (const overlay of overlays) overlayList.append(overlayButton(overlay));
}

function overlayButton(overlay) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'overlay-option';
  // aria-pressed makes it a toggle button: screen readers say "pressed",
  // and the CSS uses the same attribute for the highlight
  button.setAttribute('aria-pressed', 'false');

  const img = document.createElement('img');
  img.src = `/overlays/${overlay.filename}`;
  img.alt = ''; // the label under it already names it
  const label = document.createElement('span');
  label.textContent = overlay.label;

  button.append(img, label);
  button.addEventListener('click', () => selectOverlay(overlay, button));
  return button;
}

function selectOverlay(overlay, button) {
  const previous = overlayList.querySelector('[aria-pressed="true"]');
  if (previous) previous.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-pressed', 'true');

  selectedOverlay = overlay;
  previewOverlay.src = `/overlays/${overlay.filename}`;
  previewOverlay.hidden = false;
  updateCaptureButton();
}

// ---------- capture ----------

// The subject: disabled until an overlay is selected. Also needs a source,
// and stays disabled while a picture is being sent (one at a time).
function updateCaptureButton() {
  capture.disabled = saving || !(selectedOverlay && source);
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
      overlayId: selectedOverlay.id,
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
