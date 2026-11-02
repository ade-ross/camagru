import { api } from './api.js';
import './layout.js';
import { handleSubmit, showMessage, getToken } from './ui.js';

const form = document.getElementById('confirm-email-form');
const message = document.getElementById('message');
const done = document.getElementById('done');
const token = getToken();

// No login needed: the token proves the click comes from the new mailbox,
// and the link may be opened on another device (a phone's mail app)
if (!token) {
  form.hidden = true;
  showMessage(message, 'This link is invalid. Copy the whole link from the email.', 'error');
} else {
  handleSubmit(form, message, async () => {
    await api('POST', `/api/confirm-email/${token}`);
    form.hidden = true;
    done.hidden = false;
  });
}
