# Camagru

A photo-sharing web app in the style of the 42 school *Camagru* project: users sign up, take or upload pictures, add overlays, and share them in a public gallery with likes and comments.

> **Status: work in progress.** The backend foundations are in place; the photo editor and gallery are the next steps. See the roadmap below.

## Stack

- **Node.js 22** with the built-in `http` module: no web framework, my own router and body parser
- **PostgreSQL 16** for data, with the schema in `postgres/init.sql`
- **Docker Compose** for the whole environment, including **MailDev** to catch confirmation emails locally
- `crypto.scrypt` for password hashing; `nodemailer` for email

## What works today

- Registration with a unique username and email
- Password hashing with a random salt (scrypt) and a random confirmation token
- Email confirmation link (`GET /confirm/:token`), with the email shown in MailDev during development
- Database schema for the full app: users, sessions, images, overlays, likes and comments
- A one-command development environment (app, database and mail catcher)

## Roadmap

- [ ] Login, logout and sessions
- [ ] Forgot and reset password
- [ ] Webcam capture, upload and overlays
- [ ] Gallery with pagination, likes and comments
- [ ] Email notification when someone comments
- [ ] Frontend (HTML, CSS, JavaScript)

## Run it

You need Docker and Docker Compose.

1. Create a `.env` file next to `docker-compose.yml` (it is git-ignored, so your passwords stay out of the repo):

   ```env
   POSTGRES_USER=camagru
   POSTGRES_PASSWORD=choose-a-password
   POSTGRES_DB=camagru
   POSTGRES_HOST=postgres
   POSTGRES_PORT=5432

   SMTP_HOST=maildev
   SMTP_PORT=1025
   SMTP_FROM=camagru@localhost
   APP_URL=http://localhost:3000
   ```

2. Start everything:

   ```bash
   docker compose up --build
   ```

3. The app listens on <http://localhost:3000> and MailDev on <http://localhost:1080>.

## Project layout

```
src/
├── server.js        # HTTP server, static files, route dispatch
├── router.js        # matches method + path to a handler
├── routes/          # route groups (auth so far)
├── controllers/     # request handling
├── models/          # raw SQL per table
├── middleware/      # body parsing
└── lib/             # db pool, password hashing, mailer
postgres/init.sql    # database schema
docker-compose.yml   # app + PostgreSQL + MailDev
```
