
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(username);
}
function isValidPassword(password) {
  return typeof password === 'string' && /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
}
module.exports = { isValidEmail, isValidUsername, isValidPassword };