# Camagru

A photo-sharing web app, built for the 42 school *Camagru* project. Users take a webcam picture or upload one, choose an overlay with transparency, and the **server** composites the two. The results go to a public gallery with likes and comments.

## Run it

You need Docker with Docker Compose.

1. Create a `.env` file next to `docker-compose.yml` (it is git-ignored, so your passwords stay out of the repository):

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

   All of these are required: the server refuses to start and names any that are missing.

2. Start everything:

   ```bash
   docker compose up --build
   ```

3. Open the app at <http://localhost:3000>. Emails are not really sent: they are caught by MailDev, at <http://localhost:1080>.

The webcam only works on `localhost` or over https, because browsers refuse camera access on other plain http addresses. From another machine, use the upload instead.

## Features

- **Accounts:** sign up with a valid email and a minimum password complexity, confirm through an emailed link, log in, reset a forgotten password by email, and log out from any page. Logged-in users can change their username, email and password.
- **Editor** (logged-in users): webcam preview or image upload, a list of overlays, and a capture button that stays disabled until an overlay is selected. A side panel shows your previous pictures, and you can delete your own.
- **Gallery** (public): every user's pictures, newest first, in pages of 6. Logged-in users can like and comment. The author gets an email for each new comment, which can be turned off in the settings.

### Bonus features

- **AJAX everywhere:** forms, likes, comments and captures all work without reloading the page.
- **Live preview:** the chosen overlay is shown on top of the webcam or the uploaded picture before saving.
- **Infinite scroll:** the gallery loads the next page as you reach the bottom. It still loads real pages of 6, and the "Load more" button does the same by hand.
- **Account deletion:** in the settings, with your password. It removes your account, your pictures (files included), and your likes and comments.
- **Filters:** black & white, negative, high contrast and faded. The server applies them with GD (PHP: `imagefilter`); the editor previews them live with CSS filters calibrated to match.

## Stack

The subject only allows functions with an equivalent in the PHP standard library, so there is no framework:

- **Node.js 22** with the built-in `http` module and a small router of my own
- **PostgreSQL 16** through `pg` (PHP: `pg_*` / PDO), with the schema in `postgres/init.sql`
- **node-gd** for compositing (PHP: GD), **nodemailer** for email (PHP: `mail()`)
- **`crypto.scrypt`** from Node's standard library for password hashing
- **Plain HTML, CSS and JavaScript** in the browser, with native APIs only
- **Docker Compose** for the app, the database and MailDev

## Security

- **Passwords** are hashed with scrypt and a random salt.
- **SQL injection:** every query is parameterized (`$1` placeholders).
- **HTML/JS injection:** user content is only ever displayed through `textContent`, never `innerHTML`.
- **CSRF:** the session cookie is `SameSite=Strict` and `HttpOnly`, and request bodies must be JSON, which a cross-site form can't send.
- **Uploads:** the real file type and dimensions are checked before decoding, the result is re-encoded as a new PNG, and its file name is random.
- **Access control:** identity always comes from the session, and ownership is checked inside the SQL.
- **Credentials** live only in `.env`, which is never committed.

## Project layout

```
src/
├── server.js        # HTTP server, static files, request pipeline
├── router.js        # matches method + path to a handler
├── routes/          # URL -> controller wiring
├── controllers/     # validate input, decide, answer
├── models/          # SQL for one table
├── middleware/      # session, body parsing
└── lib/             # config, db, hashing, mailer, validators, compositing
public/              # frontend: one HTML page per screen, css/, js/, overlays/
postgres/init.sql    # database schema and overlay list
docker-compose.yml   # app + PostgreSQL + MailDev
```

Calls only go downward: routes → controllers → models and lib.

## Useful commands

```bash
docker compose logs -f node    # server logs (only printed with DEBUG=1 in .env)
docker compose down -v         # stop and DELETE all data (needed after editing init.sql)
```
