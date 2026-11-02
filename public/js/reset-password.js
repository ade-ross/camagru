import { api } from './api.js';
import './layout.js';
import { handleSubmit, showMessage, getToken } from './ui.js';

const form = document.getElementById('reset-form');
const message = document.getElementById('message');
const done = document.getElementById('done');
const token = getToken();

if (!token) {
  form.hidden = true;
  showMessage(message, 'This reset link is invalid. Copy the whole link from the email, or ask for a new one.', 'error');
} else {
  handleSubmit(form, message, async () => {
    await api('POST', `/api/reset-password/${token}`, { password: form.password.value });
    form.hidden = true;
    done.hidden = false;
  });
}
