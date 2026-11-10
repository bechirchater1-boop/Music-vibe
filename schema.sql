CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Music',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS videos_created_at_idx ON videos(created_at DESC);
