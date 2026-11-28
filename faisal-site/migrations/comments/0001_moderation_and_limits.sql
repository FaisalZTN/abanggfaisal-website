CREATE TABLE IF NOT EXISTS study_comments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_comments_pending (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  submitted_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS study_comment_attempts (
  window INTEGER NOT NULL,
  visitor TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (window, visitor)
);
