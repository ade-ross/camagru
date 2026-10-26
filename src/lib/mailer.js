const nodemailer = require('nodemailer');
const config = require('./config');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,
  // maildev needs no auth — only include auth if credentials are actually set
  ...(config.smtp.user && {
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  }),
});

// Every mail we send is "a sentence + a link". The link always points to a
// frontend PAGE, never to the API: the page's JavaScript calls the API
// (see the comment at the top of routes/auth.js for why).
async function sendLinkEmail(to, subject, sentence, pagePath) {
  const link = `${config.appUrl}${pagePath}`;
  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text: `${sentence}: ${link}`,
    html: `<p>${sentence}: <a href="${link}">${link}</a></p>`,
  });
}

const sendConfirmationEmail = (to, token) =>
  sendLinkEmail(to, 'Confirm your Camagru account', 'Click to confirm your account', `/confirm.html?token=${token}`);

const sendResetEmail = (to, token) =>
  sendLinkEmail(to, 'Reset your Camagru password', 'Reset your password', `/reset-password.html?token=${token}`);

const sendEmailChangeEmail = (to, token) =>
  sendLinkEmail(to, 'Confirm your new Camagru email', 'Confirm your new email address', `/confirm-email.html?token=${token}`);

// Not used yet: the gallery decides the final page name
const sendCommentNotification = (to, imageId) =>
  sendLinkEmail(to, 'New comment on your Camagru image', 'Someone commented on your image', `/image.html?id=${imageId}`);

module.exports = { sendConfirmationEmail, sendResetEmail, sendCommentNotification, sendEmailChangeEmail };
