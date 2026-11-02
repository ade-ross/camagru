import { api } from './api.js';
import { currentUser } from './layout.js';
import { handleSubmit, showMessage } from './ui.js';

const form = document.getElementById('register-form');
const message = document.getElementById('message');

currentUser.then((user) => {
  if (user) location.replace('/');
});

handleSubmit(form, message, async () => {
  await api('POST', '/api/register', {
    username: form.username.value,
    email: form.email.value,
    password: form.password.value,
  });
  // The account exists but can't log in until the emailed link is used
  form.hidden = true;
  showMessage(message, 'Almost done! We sent you an email: click the link in it to confirm your account.', 'success');
});
