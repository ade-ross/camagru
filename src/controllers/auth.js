const crypto = require('crypto');
const usersModel = require('../models/users');
const sessionsModel = require('../models/sessions');

const { hashPassword, verifyPassword } = require('../lib/hash');
const { sendConfirmationEmail } = require('../lib/mailer');

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Very basic, readable validation — good enough for the subject's requirements
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

function isValidPassword(password) {
  // at least 8 chars, one letter, one number — tweak as you like
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
}

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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
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
    // is wrong — never reveal which one it was, that's a username-enumeration leak.
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

module.exports = { register, confirm, login, logout };