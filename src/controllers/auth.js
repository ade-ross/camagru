const crypto = require('crypto');
const usersModel = require('../models/users');
const sessionsModel = require('../models/sessions');

const { sendJson } = require('../lib/http');
const { hashPassword, verifyPassword } = require('../lib/hash');
const { sendConfirmationEmail, sendResetEmail } = require('../lib/mailer');
const { normalizeEmail, isValidEmail, isValidUsername, isValidPassword } = require('../lib/validators');
const log = require('../lib/log');

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RESET_DURATION_MS = 1000 * 60 * 60; // 1 hour

async function register(req, res) {
  const { username, password } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!username || !email || !password) {
    return sendJson(res, 400, { error: 'Missing fields' });
  }
  if (!isValidUsername(username)) {
    return sendJson(res, 400, { error: 'Invalid username' });
  }
  if (!isValidEmail(email)) {
    return sendJson(res, 400, { error: 'Invalid email' });
  }
  if (!isValidPassword(password)) {
    return sendJson(res, 400, { error: 'Password too weak' });
  }

  try {
    const existingByUsername = await usersModel.findByUsername(username);
    if (existingByUsername) {
      return sendJson(res, 409, { error: 'Username already taken' });
    }
    const existingByEmail = await usersModel.findByEmail(email);
    if (existingByEmail) {
      return sendJson(res, 409, { error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);

    const confirmToken = crypto.randomBytes(32).toString('hex');

    // Insert the user (is_confirmed defaults to FALSE from the schema)
    const user = await usersModel.createUser({
      username,
      email,
      passwordHash,
      confirmToken,
    });

    try {
      await sendConfirmationEmail(email, confirmToken);
    } catch (err) {
      // Without this email the account could never be confirmed, and the
      // username and email would stay taken forever: undo the registration.
      log.error('Register: confirmation email failed:', err);
      await usersModel.deleteUser(user.id);
      return sendJson(res, 503, { error: 'Could not send the confirmation email, please try again later' });
    }

    return sendJson(res, 201, {
      id: user.id,
      username: user.username,
      email: user.email,
    });
  } catch (err) {
    if (err.code === '23505') {
      // two registrations raced past the checks above; the DB constraint caught it
      return sendJson(res, 409, { error: 'Username or email already taken' });
    }
    log.error('Register error:', err); // server-side log only
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// POST /api/confirm/:token, called by confirm.html (the page the email links to)
async function confirm(req, res, params) {
  const { token } = params;

  try {
    const user = await usersModel.confirmUser(token);
    if (!user) {
      return sendJson(res, 400, { error: 'Invalid or already-used confirmation link' });
    }
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    log.error('Confirm error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function login(req, res) {
  const { username, password } = req.body;

  // typeof: a JSON body can send {"password": {}}, and scrypt would throw on it (500)
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return sendJson(res, 400, { error: 'Missing fields' });
  }

  try {
    const user = await usersModel.findByUsername(username);
    // Same generic error whether the username doesn't exist or the password
    // is wrong as to never reveal which one it was cause it would be a username enumeration leak
    if (!user) {
      return sendJson(res, 401, { error: 'Invalid username or password' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return sendJson(res, 401, { error: 'Invalid username or password' });
    }

    if (!user.is_confirmed) {
      return sendJson(res, 403, { error: 'Please confirm your account first' });
    }

    await sessionsModel.deleteExpired();
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await sessionsModel.createSession(sessionId, user.id, expiresAt);

    res.setHeader(
      'Set-Cookie',
      `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`
    );
    return sendJson(res, 200, { id: user.id, username: user.username });
  } catch (err) {
    log.error('Login error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function logout(req, res) {
  try {
    if (req.sessionId) {
      await sessionsModel.deleteSession(req.sessionId);
    }
    res.setHeader('Set-Cookie', `session_id=; HttpOnly; Path=/; Max-Age=0`);
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    log.error('Logout error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function forgotPassword(req, res) {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) {
    return sendJson(res, 400, { error: 'Invalid email' });
  }

  try {
    const user = await usersModel.findByEmail(email);
    if (user && user.is_confirmed) {
      const token = crypto.randomBytes(32).toString('hex');
      await usersModel.setResetToken(user.id, token, new Date(Date.now() + RESET_DURATION_MS));
      try {
        await sendResetEmail(email, token);
      } catch (err) {
        // This 503 reveals that the account exists, but only while our mail
        // server is down, which an attacker cannot cause. The new token was
        // already saved, so a link from an earlier request stops working too;
        // the user just asks again once mail works. Accepted: rare, 1-hour links.
        log.error('ForgotPassword: reset email failed:', err);
        return sendJson(res, 503, { error: 'Could not send the email, please try again later' });
      }
    }
    // same answer whether the email exists or not (no account enumeration)
    return sendJson(res, 200, { message: 'If that email exists, a reset link was sent' });
  } catch (err) {
    log.error('ForgotPassword error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function resetPassword(req, res, params) {
  const { password } = req.body;
  if (!isValidPassword(password)) {
    return sendJson(res, 400, { error: 'Password too weak' });
  }

  try {
    const user = await usersModel.findByResetToken(params.token);
    if (!user) {
      return sendJson(res, 400, { error: 'Invalid or expired reset link' });
    }
    const hash = await hashPassword(password);
    await usersModel.updatePassword(user.id, hash); // also clears the reset token
    await sessionsModel.deleteAllSessionsForUser(user.id);
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    log.error('ResetPassword error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

module.exports = {
  register, confirm, login, logout,
  forgotPassword, resetPassword,
};
