-- Exact learning resources found for plan tasks (YouTube video, course page), cached for reuse
CREATE TABLE IF NOT EXISTS resource_cache (
  key        TEXT PRIMARY KEY,
  links      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
