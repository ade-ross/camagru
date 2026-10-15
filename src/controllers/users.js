const usersModel = require('../models/users');
const sessionsModel = require('../models/sessions');
const { hashPassword, verifyPassword } = require('../lib/hash');
const { isValidEmail, isValidUsername, isValidPassword } = require('../lib/validators');
const { requireAuth } = require('../middleware/session');
const { sendJson } = require('../lib/http');

async function getMe(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const user = await usersModel.findById(req.user.id);
    return sendJson(res, 200, user);
  } catch (err) {
    console.error('GetMe error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function updateMe(req, res) {
  if (!requireAuth(req, res)) return;

  const { username, email, notifyOnComment, currentPassword, newPassword } = req.body;

  // 1. Validate only the fields that were actually sent
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
    // 2. Uniqueness: taken by someone ELSE (your own current value is fine)
    if (username !== undefined) {
      const existing = await usersModel.findByUsername(username);
      if (existing && existing.id !== req.user.id) {
        return sendJson(res, 409, { error: 'Username already taken' });
      }
    }
    if (email !== undefined) {
      const existing = await usersModel.findByEmail(email);
      if (existing && existing.id !== req.user.id) {
        return sendJson(res, 409, { error: 'Email already registered' });
      }
    }

    // 3. Password change requires proving you know the current one
    let newHash = null;
    if (newPassword !== undefined) {
      if (typeof currentPassword !== 'string') {
        return sendJson(res, 400, { error: 'Current password required' });
      }
      const storedHash = await usersModel.getPasswordHash(req.user.id);
      const ok = await verifyPassword(currentPassword, storedHash);
      if (!ok) {
        return sendJson(res, 401, { error: 'Current password is incorrect' });
      }
      newHash = await hashPassword(newPassword);
    }

    // 4. Apply changes
    const updated = await usersModel.updateProfile(req.user.id, {
      username,
      email,
      notifyOnComment,
    });
    if (newHash) {
      await usersModel.updatePassword(req.user.id, newHash);
      // log out every other device, keep the one making this request
      await sessionsModel.deleteOtherSessions(req.user.id, req.sessionId);
    }

    return sendJson(res, 200, updated);
  } catch (err) {
    if (err.code === '23505') {
      // two requests raced past the checks; the DB constraint caught it
      return sendJson(res, 409, { error: 'Username or email already taken' });
    }
    console.error('UpdateMe error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

module.exports = { getMe, updateMe };