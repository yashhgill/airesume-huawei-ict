-- Recruiters, talent search, LinkedIn sign-in

ALTER TABLE users ADD COLUMN share_profile INTEGER NOT NULL DEFAULT 0;   -- student opted in to recruiter search
ALTER TABLE users ADD COLUMN company TEXT;                                -- recruiter's company
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN linkedin_sub TEXT;                           -- LinkedIn OpenID subject
ALTER TABLE users ADD COLUMN avatar_url TEXT;

CREATE TABLE IF NOT EXISTS shortlist (
  recruiter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL DEFAULT 'shortlisted',   -- shortlisted | contacted | interviewing | offered | passed
  note         TEXT,
  role         TEXT,                                  -- role they are being considered for
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (recruiter_id, student_id)
);

CREATE TABLE IF NOT EXISTS profile_views (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_views_student ON profile_views(student_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linkedin ON users(linkedin_sub);
