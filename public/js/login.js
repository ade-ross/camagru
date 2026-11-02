import { api } from './api.js';
import { currentUser } from './layout.js';
import { handleSubmit } from './ui.js';

const form = document.getElementById('login-form');
const message = document.getElementById('message');

// Already logged in: nothing to do here. replace() keeps this page out of the
// history, so "Back" doesn't return to a login form that would bounce again.
currentUser.then((user) => {
  if (user) location.replace('/');
});

handleSubmit(form, message, async () => {
  await api('POST', '/api/login', {
    username: form.username.value,
    password: form.password.value,
  });
  location.href = '/';
});
