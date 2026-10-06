-- Plataforma académica de Quiklabs (Cloudflare D1 / SQLite).
-- Fechas en texto ISO 8601 (UTC), que se ordenan y comparan como cadenas.

-- Licencia de la universidad: una sola fila.
CREATE TABLE license (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  institution   TEXT    NOT NULL,
  valid_from    TEXT    NOT NULL,
  valid_to      TEXT    NOT NULL,
  student_seats INTEGER NOT NULL CHECK (student_seats >= 0)
);

CREATE TABLE users (
  id                   TEXT PRIMARY KEY,
  role                 TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name                 TEXT NOT NULL,
  code                 TEXT UNIQUE,
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  password_hash        TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  token_version        INTEGER NOT NULL DEFAULT 1,
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  created_at           TEXT NOT NULL,
  last_login_at        TEXT
);
CREATE INDEX users_role ON users (role);

CREATE TABLE courses (
  id        TEXT PRIMARY KEY,
  code      TEXT NOT NULL,
  name      TEXT NOT NULL,
  term      TEXT NOT NULL,
  grp       TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at   TEXT NOT NULL,
  archived  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (code, term, grp),
  CHECK (ends_at > starts_at)
);

CREATE TABLE course_teachers (
  course_id  TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users (id),
  PRIMARY KEY (course_id, teacher_id)
);
CREATE INDEX course_teachers_teacher ON course_teachers (teacher_id);

-- Prácticas asignadas a cada curso, con su ventana de apertura y el modo.
CREATE TABLE course_labs (
  course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lab_id    TEXT NOT NULL CHECK (lab_id IN ('p2', 'p3', 'p4')),
  opens_at  TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  mode      TEXT NOT NULL CHECK (mode IN ('PRACTICE', 'GUIDED', 'EVALUATION')),
  PRIMARY KEY (course_id, lab_id),
  CHECK (closes_at > opens_at)
);

CREATE TABLE enrollments (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses (id),
  student_id  TEXT NOT NULL REFERENCES users (id),
  status      TEXT NOT NULL CHECK (status IN ('active', 'withdrawn', 'completed')),
  enrolled_at TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (course_id, student_id)
);
CREATE INDEX enrollments_student ON enrollments (student_id, status);

CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id),
  course_id    TEXT NOT NULL REFERENCES courses (id),
  lab_id       TEXT NOT NULL,
  mode         TEXT NOT NULL,
  attempt_id   TEXT NOT NULL,
  score        REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  -- [{ key, score, weight }] de la rúbrica, en JSON.
  components   TEXT NOT NULL DEFAULT '[]',
  duration_s   INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL,
  -- Reenviar el mismo intento reemplaza la entrega.
  UNIQUE (user_id, attempt_id)
);
CREATE INDEX submissions_course ON submissions (course_id, lab_id);

CREATE TABLE audit (
  id       TEXT PRIMARY KEY,
  at       TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action   TEXT NOT NULL,
  target   TEXT,
  detail   TEXT
);
CREATE INDEX audit_at ON audit (at);
