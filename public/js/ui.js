// Small helpers shared by the pages' forms.

// Shows a message in an element like <p class="message" hidden>.
// kind is 'error' or 'success'. textContent: the text is never parsed as HTML.
export function showMessage(element, text, kind) {
  element.textContent = text;
  element.className = `message ${kind}`;
  element.hidden = false;
}

// Wires a form to an async action: no page reload, one submit at a time (the
// button is disabled while waiting), and if the action throws, its message is
// shown in the message element. The browser has already checked the HTML
// validation attributes (required, pattern...) before "submit" fires.
export function handleSubmit(form, message, action) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // we send JSON with fetch instead of the browser's form submit
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.hidden = true;
    try {
      await action();
    } catch (err) {
      // the server's messages are written for users ("Username already taken"),
      // so they are shown as they are
      showMessage(message, err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

// Email links carry ?token=<64 hex>, 32 random bytes (see the server's crypto.randomBytes).
// Checking the format first gives a mangled link a clear message without asking
// the server, and guarantees only hex digits are ever put into an API URL.
// Returns the token, or null when it is missing or malformed.
export function getToken() {
  const token = new URLSearchParams(location.search).get('token');
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}
