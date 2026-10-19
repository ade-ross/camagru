const crypto = require('crypto');
const usersModel = require('../models/users');
const sessionsModel = require('../models/sessions');

const { sendJson } = require('../lib/http');
const { hashPassword, verifyPassword } = require('../lib/hash');
const { sendConfirmationEmail, sendResetEmail } = require('../lib/mailer');
const { isValidEmail, isValidUsername, isValidPassword } = require('../lib/validators');

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RESET_DURATION_MS = 1000 * 60 * 60; // 1 hour

async function register(req, res) {
  const { username, email, password } = req.body;

  // 1. Validate input shape/rules — before touching the DB at all
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
    // 2. Check uniqueness ourselves too (nicer error than a raw DB constraint failure)
    const existingByUsername = await usersModel.findByUsername(username);
    if (existingByUsername) {
      return sendJson(res, 409, { error: 'Username already taken' });
    }
    const existingByEmail = await usersModel.findByEmail(email);
    if (existingByEmail) {
      return sendJson(res, 409, { error: 'Email already registered' });
    }

    // 3. Hash the password — never store it plain
    const passwordHash = await hashPassword(password);

    // 4. Generate a random, unguessable confirmation token
    const confirmToken = crypto.randomBytes(32).toString('hex');

    // 5. Insert the user (is_confirmed defaults to FALSE from the schema)
    const user = await usersModel.createUser({
      username,
      email,
      passwordHash,
      confirmToken,
    });

    // 6. Email them the confirmation link
    await sendConfirmationEmail(email, confirmToken);

    // 7. Respond — don't leak the hash or token back to the client
    return sendJson(res, 201, {
      id: user.id,
      username: user.username,
      email: user.email,
    });
  } catch (err) {
    console.error('Register error:', err); // server-side log only
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function confirm(req, res, params) {
  const { token } = params;

  try {
    const user = await usersModel.confirmUser(token);
    if (!user) {
      return sendJson(res, 400, { error: 'Invalid or already-used confirmation link' });
    }
    // Redirect to a login page rather than returning raw JSON,
    // since this link is opened directly by clicking an email
    res.writeHead(302, { Location: '/login.html?confirmed=1' });
    res.end();
  } catch (err) {
    console.error('Confirm error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
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

    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await sessionsModel.createSession(sessionId, user.id, expiresAt);

    res.setHeader(
      'Set-Cookie',
      `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`
    );
    return sendJson(res, 200, { id: user.id, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
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
    console.error('Logout error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!isValidEmail(email)) {
    return sendJson(res, 400, { error: 'Invalid email' });
  }

  try {
    const user = await usersModel.findByEmail(email);
    if (user && user.is_confirmed) {
      const token = crypto.randomBytes(32).toString('hex');
      await usersModel.setResetToken(user.id, token, new Date(Date.now() + RESET_DURATION_MS));
      await sendResetEmail(email, token);
    }
    // same answer whether the email exists or not (no account enumeration)
    return sendJson(res, 200, { message: 'If that email exists, a reset link was sent' });
  } catch (err) {
    console.error('ForgotPassword error:', err);
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
    console.error('ResetPassword error:', err);
    return sendJson(res, 500, { error: 'Something went wrong' });
  }
}

// the link in the email is a GET, so send the browser to a real page
function resetPasswordPage(req, res, params) {
  res.writeHead(302, {
    Location: `/reset-password.html?token=${encodeURIComponent(params.token)}`,
  });
  res.end();
}

module.exports = {
  register, confirm, login, logout,
  forgotPassword, resetPassword, resetPasswordPage,
};