import { api } from './api.js';
import { currentUser } from './layout.js';
import { handleSubmit, showMessage } from './ui.js';

const form = document.getElementById('forgot-form');
const message = document.getElementById('message');

currentUser.then((user) => {
  if (user) location.replace('/');
});

handleSubmit(form, message, async () => {
  const data = await api('POST', '/api/forgot-password', { email: form.email.value });
  // The server gives the same answer whether the email exists or not
  // (no account enumeration), so we can only show that answer
  form.hidden = true;
  showMessage(message, data.message, 'success');
});
