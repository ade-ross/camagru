import { api } from './api.js';
import { currentUser } from './layout.js';
import { showMessage } from './ui.js';
import { likeView } from './likes.js';

const loginHint = document.getElementById('login-hint');
const pageMessage = document.getElementById('page-message');
const galleryEmpty = document.getElementById('gallery-empty');
const gallery = document.getElementById('gallery');
const loadMore = document.getElementById('load-more');

let user = null;
let nextUrl = '/api/gallery'; // the next page to load; null once the last page is shown
let loading = false;
let buttonInView = false;     // kept up to date by the IntersectionObserver

// The cards need to know who is logged in (like button or count only),
// so nothing is loaded before the session answer
currentUser.then((u) => {
  user = u;
  loginHint.hidden = user !== null;
  loadMore.addEventListener('click', loadPage);
  watchLoadMore();
  loadPage();
});

// IntersectionObserver: the browser calls us when the button enters or leaves
// the screen, instead of us measuring positions on every scroll event.
// rootMargin '300px': "the screen" is extended 300px downwards, so the next
// page starts loading a little before the user reaches the bottom.
function watchLoadMore() {
  const observer = new IntersectionObserver((entries) => {
    buttonInView = entries[0].isIntersecting;
    if (buttonInView) loadPage();
  }, { rootMargin: '0px 0px 300px 0px' });
  observer.observe(loadMore);
}

// Never rejects: errors are shown on the page
async function loadPage() {
  if (loading || nextUrl === null) return; // the observer and a click may both ask
  loading = true;
  loadMore.disabled = true;
  loadMore.textContent = 'Loading…';

  let page;
  try {
    page = await api('GET', nextUrl);
  } catch (err) {
    // the button stays: clicking it tries the same page again
    showMessage(pageMessage, err.message, 'error');
    loadMore.hidden = false;
    return;
  } finally {
    loading = false;
    loadMore.disabled = false;
    loadMore.textContent = 'Load more';
  }

  pageMessage.hidden = true;
  for (const image of page.images) gallery.append(card(image));
  // nextBefore is the id to continue below; null means this was the last page
  nextUrl = page.nextBefore === null ? null : `/api/gallery?before=${page.nextBefore}`;
  loadMore.hidden = nextUrl === null;
  galleryEmpty.hidden = gallery.children.length > 0;

  // The observer only calls us when the button's visibility CHANGES. On a big
  // screen 6 cards may not push it out of view: then nothing would change and
  // nothing more would load, so continue while it is still visible.
  if (buttonInView) loadPage();
}

// image: { id, filename, created_at, author, likes, comments, liked } as the API returns it.
// Built with createElement/textContent only: the author's name is user content.
function card(image) {
  const item = document.createElement('li');
  item.className = 'card';

  const link = document.createElement('a');
  link.href = `/image.html?id=${image.id}`;
  const img = document.createElement('img');
  img.src = `/uploads/${image.filename}`;
  img.alt = `Picture by ${image.author}`;
  img.loading = 'lazy';
  link.append(img);

  const byline = document.createElement('p');
  byline.className = 'byline';
  byline.textContent = `by ${image.author} · ${new Date(image.created_at).toLocaleDateString()}`;

  const comments = document.createElement('a');
  comments.href = `/image.html?id=${image.id}#comments`;
  comments.textContent = image.comments === 1 ? '1 comment' : `${image.comments} comments`;

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.append(likeView(image, user), comments);

  const info = document.createElement('div');
  info.className = 'card-info';
  info.append(byline, actions);

  item.append(link, info);
  return item;
}
