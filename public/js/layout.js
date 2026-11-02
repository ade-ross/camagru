import { api } from './api.js';

// Every page has an empty <header class="site-header"> and <footer class="site-footer">.
// This module fills them, so the nav is written once instead of copied into each page.

// Pages that need to know who is logged in import this promise instead of
// asking the server a second time. Resolves with { id, username } or null.
// It never rejects: an unhandled rejection would be an error in the console.
export const currentUser = loadUser();

fillHeader();
fillFooter();

async function loadUser() {
  try {
    const { user } = await api('GET', '/api/session');
    return user;
  } catch {
    return null; // server unreachable: show the logged-out nav rather than nothing
  }
}

function fillHeader() {
  const header = document.querySelector('.site-header');
  const brand = link('/', 'Camagru');
  brand.className = 'brand';
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  header.append(brand, nav);

  // the logo appears at once; the links wait for the session answer
  currentUser.then((user) => {
    nav.append(link('/', 'Gallery'));
    if (user) {
      const name = document.createElement('span');
      name.className = 'username';
      // textContent, never innerHTML: user content is always shown as text,
      // so a name like "<script>" can't become markup
      name.textContent = user.username;
      nav.append(link('/editor.html', 'Editor'), link('/settings.html', 'Settings'), name, logoutButton());
    } else {
      nav.append(link('/login.html', 'Log in'), link('/register.html', 'Sign up'));
    }
  });
}

function fillFooter() {
  document.querySelector('.site-footer').textContent = 'Camagru · a 42 school project';
}

function link(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  return a;
}

// A button, not a link: logging out changes state, so it is a POST, never a GET
function logoutButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-button';
  button.textContent = 'Log out';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api('POST', '/api/logout');
      location.href = '/'; // leave the page: it may show private content
    } catch (err) {
      button.disabled = false;
      alert(err.message);
    }
  });
  return button;
}
