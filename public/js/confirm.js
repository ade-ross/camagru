import { api } from './api.js';
import './layout.js';
import { handleSubmit, showMessage, getToken } from './ui.js';

const form = document.getElementById('confirm-form');
const message = document.getElementById('message');
const done = document.getElementById('done');
const token = getToken();

if (!token) {
  form.hidden = true;
  showMessage(message, 'This confirmation link is invalid. Copy the whole link from the email.', 'error');
} else {
  handleSubmit(form, message, async () => {
    await api('POST', `/api/confirm/${token}`);
    form.hidden = true;
    done.hidden = false; // static HTML with a link, so no innerHTML needed
  });
}
