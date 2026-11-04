import { api } from './api.js';

// The like control of one picture, shared by the gallery cards and image.html.
// image: { id, likes, liked } as the API returns it. user: currentUser's value.
export function likeView(image, user) {
  if (!user) {
    // The subject: only logged-in users can like. A visitor sees the count but
    // gets no button, so they can't even send a request that would answer 401.
    const count = document.createElement('span');
    count.className = 'like-count';
    count.textContent = likesText(image.likes);
    return count;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'like-button';
  showLike(button, image.liked, image.likes);

  button.addEventListener('click', async () => {
    const liked = button.getAttribute('aria-pressed') === 'true';
    button.disabled = true; // one request at a time: no like/unlike race
    try {
      // POST adds the like, DELETE removes it. The count shown is the server's,
      // so it also includes likes other users added since the page loaded.
      const result = await api(liked ? 'DELETE' : 'POST', `/api/images/${image.id}/like`);
      showLike(button, result.liked, result.likes);
    } catch (err) {
      // alert, like the logout button: in a long gallery a message at the top
      // of the page would be out of sight
      alert(likeErrorText(err));
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

// aria-pressed="true" marks an on/off button as "on", for screen readers and
// for the CSS (same idea as the overlay buttons in the editor)
function showLike(button, liked, likes) {
  button.setAttribute('aria-pressed', String(liked));
  button.title = liked ? 'Unlike' : 'Like';
  button.textContent = likesText(likes);
}

function likesText(likes) {
  return `♥ ${likes}`;
}

function likeErrorText(err) {
  if (err.status === 401) return 'Your session has expired, please log in again.';
  if (err.status === 404) return 'This picture was deleted.';
  return err.message;
}
