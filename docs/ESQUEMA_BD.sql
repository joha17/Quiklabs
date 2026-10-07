-- Esquema actual de la base de la plataforma (Cloudflare D1 «quiklabs», SQLite).
-- Leído de producción el 2026-10-07, con las migraciones 0001_init a 0004_server_grading aplicadas.
-- Es una referencia: la fuente de verdad son los archivos de migrations/ (para cambiar el esquema se agrega una
-- migración nueva). Los comentarios son de documentación; la base no los guarda.
-- Fechas en texto ISO 8601; booleanos como INTEGER 0/1; JSON en columnas TEXT.
--
--   users ─┬─< course_teachers >── courses ──< course_labs
--          ├─< enrollments    >──┘    │
--          └─< submissions    >───────┘
--                 └──< submission_data
--   license (una fila) · audit (independiente)

-- Cuentas (sin registro público: las crea la administración).
CREATE TABLE users (
  id                   TEXT PRIMARY KEY,
  role                 TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name                 TEXT NOT NULL,
  code                 TEXT UNIQUE,                       -- carné (estudiantes) o código de funcionario
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  password_hash        TEXT NOT NULL,                     -- pbkdf2$sha256$<iteraciones>$<sal>$<hash>
  must_change_password INTEGER NOT NULL DEFAULT 1,
  token_version        INTEGER NOT NULL DEFAULT 1,        -- subirlo invalida las sesiones abiertas
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  created_at           TEXT NOT NULL,
  last_login_at        TEXT
);

-- Licencia de la universidad: vigencia y cupo de estudiantes con matrícula activa.
CREATE TABLE license (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  institution   TEXT    NOT NULL,
  valid_from    TEXT    NOT NULL,
  valid_to      TEXT    NOT NULL,
  student_seats INTEGER NOT NULL CHECK (student_seats >= 0)
);

CREATE TABLE courses (
  id        TEXT PRIMARY KEY,
  code      TEXT NOT NULL,                                -- sigla
  name      TEXT NOT NULL,
  term      TEXT NOT NULL,                                -- periodo
  grp       TEXT NOT NULL,                                -- grupo
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

-- Prácticas de cada curso: disponibles para los estudiantes entre la apertura y el cierre, en el modo indicado.
CREATE TABLE course_labs (
  course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lab_id    TEXT NOT NULL CHECK (lab_id IN ('p2', 'p3', 'p4', 'p5', 'p6')),
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

-- Entregas: una por estudiante e intento (reenviar el mismo intento la reemplaza).
CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id),
  course_id    TEXT NOT NULL REFERENCES courses (id),
  lab_id       TEXT NOT NULL,
  mode         TEXT NOT NULL,
  attempt_id   TEXT NOT NULL,
  score        REAL NOT NULL CHECK (score >= 0 AND score <= 1),   -- nota calculada por el servidor
  components   TEXT NOT NULL DEFAULT '[]',                         -- JSON [{ key, score, weight }] de la rúbrica
  duration_s   INTEGER NOT NULL DEFAULT 0,                         -- tiempo simulado del intento
  submitted_at TEXT NOT NULL,
  client_score REAL,                                               -- nota del navegador (solo para comparar)
  grading      TEXT NOT NULL DEFAULT 'CLIENT' CHECK (grading IN ('CLIENT', 'SERVER')),  -- CLIENT = entrega anterior a 0004
  issues       TEXT NOT NULL DEFAULT '[]',                         -- JSON con los avisos de plausibilidad
  replay       TEXT,                                               -- JSON con la repetición docente (null si no se repitió)
  UNIQUE (user_id, attempt_id)
);

-- Estado entregado, cinta de comandos y opciones de creación de cada entrega (gzip + base64, en partes de 1 MB
-- porque D1 limita el tamaño de cada valor).
CREATE TABLE submission_data (
  submission_id TEXT NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('snapshot', 'tape', 'options')),
  part          INTEGER NOT NULL,
  data          TEXT NOT NULL,
  PRIMARY KEY (submission_id, kind, part)
);

-- Acciones de administración, de los docentes y de seguridad.
CREATE TABLE audit (
  id       TEXT PRIMARY KEY,
  at       TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action   TEXT NOT NULL,
  target   TEXT,
  detail   TEXT
);

CREATE INDEX users_role              ON users (role);
CREATE INDEX course_teachers_teacher ON course_teachers (teacher_id);
CREATE INDEX enrollments_student     ON enrollments (student_id, status);
CREATE INDEX submissions_course      ON submissions (course_id, lab_id);
CREATE INDEX audit_at                ON audit (at);
