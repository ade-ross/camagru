import { api } from './api.js';
import { currentUser } from './layout.js';
import { showMessage, handleSubmit } from './ui.js';
import { likeView } from './likes.js';

const pageMessage = document.getElementById('page-message');
const picture = document.getElementById('picture');
const pictureImg = document.getElementById('picture-img');
const pictureByline = document.getElementById('picture-byline');
const pictureActions = document.getElementById('picture-actions');

const commentsTitle = document.getElementById('comments-title');
const noComments = document.getElementById('no-comments');
const commentList = document.getElementById('comment-list');
const loginHint = document.getElementById('login-hint');
const commentForm = document.getElementById('comment-form');
const commentMessage = document.getElementById('comment-message');

const NOT_FOUND = "This picture doesn't exist or was deleted.";

// image.html?id=<number>. Checked like getToken() checks tokens: a mangled
// link gets a clear message without asking the server, and only digits are
// ever put into the API URL.
const id = new URLSearchParams(location.search).get('id');

currentUser.then(async (user) => {
  if (!/^\d{1,9}$/.test(id)) {
    showMessage(pageMessage, NOT_FOUND, 'error');
    return;
  }

  let data;
  try {
    data = await api('GET', `/api/gallery/${id}`);
  } catch (err) {
    showMessage(pageMessage, err.status === 404 ? NOT_FOUND : err.message, 'error');
    return;
  }
  showPicture(data.image, data.comments, user);
});

function showPicture(image, comments, user) {
  pictureImg.src = `/uploads/${image.filename}`;
  pictureImg.alt = `Picture by ${image.author}`;
  pictureByline.textContent = `by ${image.author} · ${new Date(image.created_at).toLocaleString()}`;
  pictureActions.append(likeView(image, user));

  for (const comment of comments) commentList.append(commentItem(comment));
  updateCommentCount();

  // only logged-in users can comment: visitors get the hint instead of the form
  loginHint.hidden = user !== null;
  commentForm.hidden = user === null;
  picture.hidden = false;

  // The gallery's "N comments" link ends with #comments. The browser tried to
  // scroll there on load, but the section was still hidden, so do it now.
  if (location.hash === '#comments') document.getElementById('comments').scrollIntoView();
}

handleSubmit(commentForm, commentMessage, async () => {
  const text = commentForm.elements.text.value.trim();
  // "required" accepts a comment made only of spaces; the server would refuse it
  if (text === '') throw new Error('A comment cannot be empty');

  let comment;
  try {
    comment = await api('POST', `/api/images/${id}/comments`, { text });
  } catch (err) {
    // the server's "Not found" would be unclear here: the picture was deleted meanwhile
    throw err.status === 404 ? new Error(NOT_FOUND) : err;
  }
  commentList.append(commentItem(comment));
  updateCommentCount();
  commentForm.reset();
});

// comment: { id, body, created_at, author }. textContent only: a comment
// containing "<script>" is shown as those characters, never run.
function commentItem(comment) {
  const item = document.createElement('li');

  const meta = document.createElement('p');
  meta.className = 'comment-meta';
  const author = document.createElement('strong');
  author.textContent = comment.author;
  meta.append(author, ` · ${new Date(comment.created_at).toLocaleString()}`);

  const body = document.createElement('p');
  body.className = 'comment-body';
  body.textContent = comment.body;

  item.append(meta, body);
  return item;
}

function updateCommentCount() {
  const count = commentList.children.length;
  commentsTitle.textContent = `Comments (${count})`;
  noComments.hidden = count > 0;
}
