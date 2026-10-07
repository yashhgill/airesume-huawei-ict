-- Multi-level university management:
--   platform admin  → universities
--   university admin → faculties
--   faculty admin    → degree programmes
--   coordinator      → PLOs, subjects, CLOs, skill mapping for their programmes

ALTER TABLE institutions ADD COLUMN email_domain TEXT;          -- e.g. student.utem.edu.my, used to suggest a university
ALTER TABLE institutions ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE faculties ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE programmes ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE programmes ADD COLUMN mqa_code TEXT;               -- MQA accreditation reference
ALTER TABLE programmes ADD COLUMN duration_years INTEGER DEFAULT 4;
ALTER TABLE subjects ADD COLUMN credits INTEGER;
ALTER TABLE subjects ADD COLUMN semester INTEGER;
ALTER TABLE subjects ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS role_assignments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,                 -- uni_admin | faculty_admin | coordinator
  institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
  faculty_id     INTEGER REFERENCES faculties(id) ON DELETE CASCADE,
  programme_id   INTEGER REFERENCES programmes(id) ON DELETE CASCADE,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_roles_user ON role_assignments(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_unique ON role_assignments(user_id, role, COALESCE(institution_id,0), COALESCE(faculty_id,0), COALESCE(programme_id,0));

-- Every curriculum change is recorded for accreditation audits
CREATE TABLE IF NOT EXISTS curriculum_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT,
  programme_id INTEGER,
  faculty_id   INTEGER,
  institution_id INTEGER,
  action       TEXT NOT NULL,
  detail       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_curlog ON curriculum_log(institution_id, created_at);

UPDATE institutions SET email_domain='utem.edu.my' WHERE id=1;

-- Real UTeM structure (source: ftmk.utem.edu.my, utem.edu.my/academic)
UPDATE faculties SET short_name='FTMK', name='Fakulti Teknologi Maklumat dan Komunikasi' WHERE id=1;
INSERT INTO faculties (institution_id,name,short_name) VALUES
  (1,'Fakulti Kecerdasan Buatan dan Keselamatan Siber','FAIX'),
  (1,'Fakulti Teknologi dan Kejuruteraan Elektronik dan Komputer','FTKEK'),
  (1,'Fakulti Teknologi dan Kejuruteraan Elektrik','FTKE'),
  (1,'Fakulti Teknologi dan Kejuruteraan Mekanikal','FTKM'),
  (1,'Fakulti Teknologi dan Kejuruteraan Industri dan Pembuatan','FTKIP'),
  (1,'Fakulti Pengurusan Teknologi dan Teknousahawanan','FPTT');
-- AI and Computer Security moved to FAIX
UPDATE programmes SET faculty_id=(SELECT id FROM faculties WHERE short_name='FAIX') WHERE id IN (3,5);
UPDATE programmes SET mqa_code='MQA/FA 1890' WHERE id=4;
UPDATE programmes SET mqa_code='MQA/FA 1887' WHERE id=2;
UPDATE programmes SET mqa_code='MQA/PA14792' WHERE id=1;
INSERT INTO programmes (faculty_id,name,level,mqa_code) VALUES
  (1,'Bachelor of Computer Science (Database Management) with Honours','Bachelor','MQA/FA 1889'),
  (1,'Bachelor of Computer Science (Interactive Media) with Honours','Bachelor','MQA/FA 1885'),
  (1,'Bachelor of Information Technology (Game Technology) with Honours','Bachelor','MBOT/PR/IT/0/02/0073');
-- every new programme starts from the standard 11 MQA programme outcomes; coordinators edit them
INSERT INTO plos (programme_id,code,domain,description,sort_order)
  SELECT p.id, t.code, t.domain, t.description, t.sort_order FROM programmes p, plos t
  WHERE t.programme_id=1 AND p.id NOT IN (SELECT DISTINCT programme_id FROM plos);
