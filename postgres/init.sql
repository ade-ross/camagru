CREATE TABLE users (
  id                   SERIAL PRIMARY KEY,
  username             VARCHAR(32) UNIQUE NOT NULL,
  email                VARCHAR(255) UNIQUE NOT NULL,
  pending_email        VARCHAR(255),
  pending_email_token  VARCHAR(64),
  ending_email_expires TIMESTAMPTZ,
  password_hash        VARCHAR(255) NOT NULL,
  is_confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
  confirm_token        VARCHAR(64),
  reset_token          VARCHAR(64),
  reset_token_expires  TIMESTAMPTZ,
  notify_on_comment    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          VARCHAR(64) PRIMARY KEY,   -- random token, stored in cookie
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE images (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename    VARCHAR(255) NOT NULL,     -- generated server-side, never user input
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE overlays (              -- the predefined superposable images
  id          SERIAL PRIMARY KEY,
  filename    VARCHAR(255) NOT NULL,
  label       VARCHAR(100)
);

CREATE TABLE likes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_id    INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, image_id)
);

CREATE TABLE comments (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_id    INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_images_created_at ON images(created_at DESC);
CREATE INDEX idx_comments_image_id ON comments(image_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
