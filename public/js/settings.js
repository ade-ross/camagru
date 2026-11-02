import { api } from './api.js';
import { currentUser, updateHeaderUsername } from './layout.js';
import { handleSubmit, showMessage } from './ui.js';

const settings = document.getElementById('settings');
const needLogin = document.getElementById('need-login');
const pageMessage = document.getElementById('page-message');

const profileForm = document.getElementById('profile-form');
const profileMessage = document.getElementById('profile-message');

const emailForm = document.getElementById('email-form');
const emailMessage = document.getElementById('email-message');
const pendingNotice = document.getElementById('pending-email');
const pendingAddress = document.getElementById('pending-address');
const cancelEmail = document.getElementById('cancel-email');

const passwordForm = document.getElementById('password-form');
const passwordMessage = document.getElementById('password-message');

let me; // the profile as GET /api/users/me last returned it

// Only ask for the profile when someone is logged in: for a visitor,
// /api/users/me would answer 401 (a red line in Chrome's console)
currentUser.then(async (user) => {
  if (!user) {
    needLogin.hidden = false;
    return;
  }
  try {
    me = await api('GET', '/api/users/me');
  } catch (err) {
    showMessage(pageMessage, err.message, 'error');
    return;
  }
  profileForm.username.value = me.username;
  profileForm.notify.checked = me.notify_on_comment;
  emailForm.email.value = me.email;
  showPending(me.pending_email);
  settings.hidden = false;
});

function showPending(address) {
  pendingAddress.textContent = address || '';
  pendingNotice.hidden = !address;
}

handleSubmit(profileForm, profileMessage, async () => {
  const updated = await api('PATCH', '/api/users/me', {
    username: profileForm.username.value,
    notifyOnComment: profileForm.notify.checked,
  });
  updateHeaderUsername(updated.username);
  showMessage(profileMessage, 'Saved.', 'success');
});

handleSubmit(emailForm, emailMessage, async () => {
  const result = await api('PATCH', '/api/users/me', {
    email: emailForm.email.value,
    currentPassword: emailForm.currentPassword.value,
  });
  emailForm.currentPassword.value = '';
  // The PATCH answer doesn't include the pending address: ask for the profile again
  me = await api('GET', '/api/users/me');
  emailForm.email.value = me.email; // the real email only changes when the link is used
  showPending(me.pending_email);
  showMessage(
    emailMessage,
    result.emailPending
      ? 'We sent a link to the new address. Your email changes when you click it (the link works for 1 hour).'
      : 'This is already your email.',
    'success'
  );
});

// Sending the current email again makes the server drop the pending change.
// No password needed: going back to your own email can't take over an account.
cancelEmail.addEventListener('click', async () => {
  cancelEmail.disabled = true;
  emailMessage.hidden = true;
  try {
    await api('PATCH', '/api/users/me', { email: me.email });
    showPending(null);
    showMessage(emailMessage, 'The email change was cancelled.', 'success');
  } catch (err) {
    showMessage(emailMessage, err.message, 'error');
  } finally {
    cancelEmail.disabled = false;
  }
});

handleSubmit(passwordForm, passwordMessage, async () => {
  await api('PATCH', '/api/users/me', {
    currentPassword: passwordForm.currentPassword.value,
    newPassword: passwordForm.newPassword.value,
  });
  passwordForm.reset(); // empty both fields: passwords shouldn't stay on screen
  showMessage(passwordMessage, 'Password changed. You were logged out on your other devices.', 'success');
});
