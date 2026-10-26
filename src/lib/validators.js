// Max lengths protect the database (VARCHAR sizes in init.sql) and the server
// (an enormous "password" would still have to be hashed).
const EMAIL_MAX = 254; // longest valid email address
const PASSWORD_MAX = 128;

// "Alice@X.com " and "alice@x.com" are the same mailbox: store and compare
// emails in one form only. Leaves non-strings alone so validation rejects them.
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= EMAIL_MAX
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(username);
}
function isValidPassword(password) {
  return typeof password === 'string' && password.length <= PASSWORD_MAX
    && /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
}

module.exports = { normalizeEmail, isValidEmail, isValidUsername, isValidPassword };
