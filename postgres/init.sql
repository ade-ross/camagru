CREATE TABLE users (
  id                    SERIAL PRIMARY KEY,
  username              VARCHAR(32) NOT NULL,           -- unique ignoring case: see index below
  email                 VARCHAR(255) UNIQUE NOT NULL,   -- always stored lowercase by the app
  pending_email         VARCHAR(255),
  pending_email_token   VARCHAR(64),
  pending_email_expires TIMESTAMPTZ,
  password_hash         VARCHAR(255) NOT NULL,
  is_confirmed          BOOLEAN NOT NULL DEFAULT FALSE,
  confirm_token         VARCHAR(64),
  reset_token           VARCHAR(64),
  reset_token_expires   TIMESTAMPTZ,
  notify_on_comment     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
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
  label       VARCHAR(100),
  -- Stickers only: the point (in the 640x480 file) the user moves and resizes
  -- them by. NULL = a frame, always drawn full-size.
  center_x    INTEGER,
  center_y    INTEGER,
  CHECK ((center_x IS NULL) = (center_y IS NULL)) -- both set or neither
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
-- the primary key (user_id, image_id) can't find "all likes of picture X" fast
CREATE INDEX idx_likes_image_id ON likes(image_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- "Alice" and "alice" must not be two accounts: uniqueness on the lowercase form.
-- findByUsername searches with LOWER(username), so it uses this index too.
CREATE UNIQUE INDEX users_username_lower_idx ON users (LOWER(username));

INSERT INTO overlays (filename, label) VALUES
  ('frame-gold.png', 'Gold frame'), ('frame-polaroid.png', 'Polaroid'),
  ('vignette.png', 'Vignette'),
  ('stars.png', 'Stars'), ('hearts.png', 'Hearts'), ('confetti.png', 'Confetti');

-- centers measured on each file's visible pixels
INSERT INTO overlays (filename, label, center_x, center_y) VALUES
  ('sunglasses.png', 'Sunglasses', 320, 235), ('cat-face.png', 'Cat face', 320, 186),
  ('party-hat.png', 'Party hat', 320, 78), ('crown.png', 'Crown', 320, 90),
  ('mustache.png', 'Mustache', 320, 318), ('speech-bubble.png', 'Speech bubble', 472, 108);
