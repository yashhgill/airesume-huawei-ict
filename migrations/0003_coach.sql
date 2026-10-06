-- AI coach, mock interviews and learning plans

CREATE TABLE IF NOT EXISTS coach_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,              -- user | coach
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coach_user ON coach_messages(user_id, id);

CREATE TABLE IF NOT EXISTS interviews (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'mixed',   -- behavioural | technical | mixed
  questions   TEXT NOT NULL,                   -- JSON [{q, focus, tip}]
  answers     TEXT NOT NULL DEFAULT '[]',      -- JSON [{answer, score, verdict, strengths, improve, better}]
  score       INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_interviews_user ON interviews(user_id, created_at);

CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,                   -- JSON {summary, weeks:[{week, theme, tasks:[{title, kind, resource, minutes, done}]}]}
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id, created_at);
