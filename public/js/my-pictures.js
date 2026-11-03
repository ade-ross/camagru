import { api } from './api.js';
import { showMessage } from './ui.js';

// The editor's side panel: the logged-in user's own pictures, each with Delete.
// editor.js only calls loadMyPictures() once and addPicture() after each save.

const sideMessage = document.getElementById('side-message');
const noPictures = document.getElementById('no-pictures');
const myPictures = document.getElementById('my-pictures');

// Never rejects: errors are shown in the panel
export async function loadMyPictures() {
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

// A picture just created: on top, like the newest in the server's list
export function addPicture(image) {
  myPictures.prepend(thumbnail(image));
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
