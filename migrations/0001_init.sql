-- AI Resume — schema (SQLite dialect: Cloudflare D1 in the cloud, node:sqlite on Huawei ECS)

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  location      TEXT,
  headline      TEXT,
  linkedin      TEXT,
  github        TEXT,
  website       TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student',   -- student | admin
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS institutions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  short_name  TEXT,
  city        TEXT,
  country     TEXT DEFAULT 'Malaysia'
);

CREATE TABLE IF NOT EXISTS faculties (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id  INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  short_name      TEXT
);

CREATE TABLE IF NOT EXISTS programmes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  faculty_id  INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
  code        TEXT,
  name        TEXT NOT NULL,
  level       TEXT DEFAULT 'Bachelor'
);

-- Programme Learning Outcomes (MQA domains)
CREATE TABLE IF NOT EXISTS plos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  programme_id  INTEGER NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  domain        TEXT,
  description   TEXT NOT NULL,
  sort_order    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subjects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  programme_id  INTEGER NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  code          TEXT,
  name          TEXT NOT NULL,
  year          INTEGER,
  clos          TEXT DEFAULT '[]',   -- JSON array of course learning outcomes
  plo_codes     TEXT DEFAULT '[]',   -- JSON array of PLO codes this subject supports
  skills        TEXT DEFAULT '[]'    -- JSON array of skills the subject builds
);

CREATE TABLE IF NOT EXISTS education (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  programme_id    INTEGER REFERENCES programmes(id),
  institution     TEXT NOT NULL,
  qualification   TEXT NOT NULL,
  start_year      INTEGER,
  end_year        INTEGER,
  cgpa            REAL,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS user_subjects (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade       TEXT,
  PRIMARY KEY (user_id, subject_id)
);

CREATE TABLE IF NOT EXISTS skills (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT DEFAULT 'Technical',   -- Technical | Tool | Soft | Language
  level        INTEGER DEFAULT 3,          -- 1..5
  source       TEXT DEFAULT 'manual',      -- manual | subject | ai | import
  evidence     TEXT,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS experiences (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT DEFAULT 'work',        -- work | internship | project | activity
  title        TEXT NOT NULL,
  organisation TEXT,
  start_date   TEXT,
  end_date     TEXT,
  description  TEXT,
  sort_order   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS certifications (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  issuer    TEXT,
  year      TEXT,
  url       TEXT
);

CREATE TABLE IF NOT EXISTS resumes (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  target_role  TEXT,
  template     TEXT DEFAULT 'modern',
  content      TEXT NOT NULL,            -- JSON (see server/lib/resume.ts)
  job_ref      TEXT,                     -- JSON of the job it was tailored for
  ats_score    INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_jobs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job         TEXT NOT NULL,             -- JSON job snapshot
  match_score INTEGER,
  status      TEXT DEFAULT 'saved',      -- saved | applied | interview | offer | rejected
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  ok          INTEGER DEFAULT 1,
  ms          INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subjects_prog   ON subjects(programme_id);
CREATE INDEX IF NOT EXISTS idx_plos_prog       ON plos(programme_id);
CREATE INDEX IF NOT EXISTS idx_skills_user     ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_user        ON experiences(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_user    ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user       ON saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_time   ON activity(created_at);
