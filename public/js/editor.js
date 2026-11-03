import { api } from './api.js';
import { currentUser } from './layout.js';
import { showMessage } from './ui.js';

const editor = document.getElementById('editor');
const needLogin = document.getElementById('need-login');
const pageMessage = document.getElementById('page-message');

const previewOverlay = document.getElementById('preview-overlay');
const overlayList = document.getElementById('overlays');
const capture = document.getElementById('capture');

const sideMessage = document.getElementById('side-message');
const noPictures = document.getElementById('no-pictures');
const myPictures = document.getElementById('my-pictures');

let selectedOverlay = null; // { id, filename, label } from /api/overlays
// true once there is something to photograph: the webcam or an uploaded file
let pictureReady = false;

// Visitors get the polite message and nothing else: no camera request,
// no /api/images call (it would answer 401)
currentUser.then((user) => {
  if (!user) {
    needLogin.hidden = false;
    return;
  }
  editor.hidden = false;
  // both catch their own errors, so their promises can't reject unhandled
  loadOverlays();
  loadMyPictures();
});

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

function updateCaptureButton() {
  capture.disabled = !(selectedOverlay && pictureReady);
}

// ---------- side panel: my pictures ----------

async function loadMyPictures() {
  let images;
  try {
    images = await api('GET', '/api/images');
  } catch (err) {
    showMessage(sideMessage, err.message, 'error');
    return;
  }
  for (const image of images) myPictures.append(thumbnail(image)); // the server sends newest first
  updateEmptyState();
}

// image: { id, filename, created_at } as the API returns it
function thumbnail(image) {
  const item = document.createElement('li');

  const img = document.createElement('img');
  img.src = `/uploads/${image.filename}`;
  img.alt = `My picture from ${new Date(image.created_at).toLocaleString()}`;
  img.loading = 'lazy'; // a long list only downloads the pictures scrolled into view

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'link-button';
  remove.textContent = 'Delete';
  remove.addEventListener('click', () => deletePicture(image, item, remove));

  item.append(img, remove);
  return item;
}

async function deletePicture(image, item, button) {
  if (!confirm('Delete this picture? This cannot be undone.')) return;
  button.disabled = true;
  sideMessage.hidden = true;
  try {
    await api('DELETE', `/api/images/${image.id}`);
    item.remove();
  } catch (err) {
    if (err.status === 404) {
      item.remove(); // already gone (deleted in another tab): nothing left to show
    } else {
      showMessage(sideMessage, err.message, 'error');
      button.disabled = false;
    }
  }
  updateEmptyState();
}

function updateEmptyState() {
  noPictures.hidden = myPictures.children.length > 0;
}
