const usersModel = require('../models/users');
const sessionsModel = require('../models/sessions');
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('../lib/hash');
const { normalizeEmail, isValidEmail, isValidUsername, isValidPassword } = require('../lib/validators');
const { requireAuth } = require('../middleware/session');
const { sendJson } = require('../lib/http');
const { sendEmailChangeEmail } = require('../lib/mailer');
const log = require('../lib/log');

async function getMe(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const user = await usersModel.findById(req.user.id);
    return sendJson(res, 200, user);
  } catch (err) {
    log.error('GetMe error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function updateMe(req, res) {
  if (!requireAuth(req, res)) return;

  const { username, notifyOnComment, currentPassword, newPassword } = req.body;
  const email = normalizeEmail(req.body.email);

  // Validate only the fields that were actually sent
  if (username !== undefined && !isValidUsername(username)) {
    return sendJson(res, 400, { error: 'Invalid username' });
  }
  if (email !== undefined && !isValidEmail(email)) {
    return sendJson(res, 400, { error: 'Invalid email' });
  }
  if (notifyOnComment !== undefined && typeof notifyOnComment !== 'boolean') {
    return sendJson(res, 400, { error: 'Invalid notification preference' });
  }
  if (newPassword !== undefined && !isValidPassword(newPassword)) {
    return sendJson(res, 400, { error: 'New password too weak' });
  }

  try {
    const current = await usersModel.findById(req.user.id);
    const emailChanged = email !== undefined && email !== current.email;
    const emailReverted = email !== undefined && email === current.email;

    // Changing the email or the password needs the current password: someone who
    // only stole the session cookie must not be able to take over the account.
    if (emailChanged || newPassword !== undefined) {
      if (typeof currentPassword !== 'string') {
        return sendJson(res, 400, { error: 'Current password required' });
      }
      const storedHash = await usersModel.getPasswordHash(req.user.id);
      if (!(await verifyPassword(currentPassword, storedHash))) {
        return sendJson(res, 403, { error: 'Current password is incorrect' });
      }
    }

    // Uniqueness
    if (username !== undefined) {
      const existing = await usersModel.findByUsername(username);
      if (existing && existing.id !== req.user.id) {
        return sendJson(res, 409, { error: 'Username already taken' });
      }
    }
    if (emailChanged && await usersModel.findByEmail(email)) {
      return sendJson(res, 409, { error: 'Email already registered' });
    }

    const newHash = newPassword !== undefined ? await hashPassword(newPassword) : null;

    // The email mail goes out FIRST: if it fails, we answer 503 before any
    // other field has been saved, so the user never gets a half-done update.
    if (emailChanged) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
      await usersModel.setPendingEmail(req.user.id, email, token, expires);
      try {
        await sendEmailChangeEmail(email, token);
      } catch (err) {
        await usersModel.clearPendingEmail(req.user.id);
        log.error('UpdateMe: email change mail failed:', err);
        return sendJson(res, 503, { error: 'Could not send the confirmation email, please try again later' });
      }
    } else if (emailReverted) {
      await usersModel.clearPendingEmail(req.user.id);
    }

    const updated = await usersModel.updateProfile(req.user.id, { username, notifyOnComment });

    if (newHash) {
      await usersModel.updatePassword(req.user.id, newHash);
      // log out every other device, keep the one making this request
      await sessionsModel.deleteOtherSessions(req.user.id, req.sessionId);
    }

    return sendJson(res, 200, { ...updated, emailPending: emailChanged });
  } catch (err) {
    if (err.code === '23505') {
      // two requests raced past the checks; the DB constraint caught it
      return sendJson(res, 409, { error: 'Username or email already taken' });
    }
    log.error('UpdateMe error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// POST /api/confirm-email/:token, called by confirm-email.html (the page the email links to)
async function confirmEmail(req, res, params) {
  try {
    const user = await usersModel.confirmPendingEmail(params.token);
    if (!user) {
      return sendJson(res, 400, { error: 'Invalid or expired link' });
    }
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'That email was taken in the meantime' });
    }
    log.error('ConfirmEmail error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

module.exports = { getMe, updateMe, confirmEmail };
