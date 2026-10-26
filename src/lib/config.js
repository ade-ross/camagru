// Reads every setting from the environment ONCE, when the server starts.
// If a required one is missing, the server refuses to start and says exactly
// which ones, instead of failing later with a 500 on the first request.
const REQUIRED = [
  'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_HOST', 'POSTGRES_PORT',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM',
  'APP_URL',
];

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Add them to your .env file.`);
  process.exit(1);
}

const env = process.env;

module.exports = {
  port: Number(env.PORT) || 3000,
  appUrl: env.APP_URL.replace(/\/+$/, ''), // no trailing slash: links add their own
  db: {
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT),
  },
  smtp: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    from: env.SMTP_FROM,
    user: env.SMTP_USER || null, // optional: MailDev needs no login
    pass: env.SMTP_PASS || null,
  },
};
