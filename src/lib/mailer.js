const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  // maildev needs no auth — only include auth if credentials are actually set
  ...(process.env.SMTP_USER && {
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  }),
});

async function sendConfirmationEmail(to, token) {
  const link = `${process.env.APP_URL}/confirm/${token}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Confirm your Camagru account',
    text: `Click to confirm your account: ${link}`,
    html: `<p>Click to confirm your account: <a href="${link}">${link}</a></p>`,
  });
}

async function sendResetEmail(to, token) {
  const link = `${process.env.APP_URL}/reset-password/${token}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Reset your Camagru password',
    text: `Reset your password: ${link}`,
    html: `<p>Reset your password: <a href="${link}">${link}</a></p>`,
  });
}

async function sendCommentNotification(to, imageUrl) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'New comment on your Camagru image',
    text: `Someone commented on your image: ${imageUrl}`,
    html: `<p>Someone commented on your image: <a href="${imageUrl}">${imageUrl}</a></p>`,
  });
}

async function sendEmailChangeEmail(to, token) {
  const link = `${process.env.APP_URL}/confirm-email/${token}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Confirm your new Camagru email',
    text: `Confirm your new email address: ${link}`,
    html: `<p>Confirm your new email address: <a href="${link}">${link}</a></p>`,
  });
}

module.exports = { sendConfirmationEmail, sendResetEmail, sendCommentNotification, sendEmailChangeEmail };