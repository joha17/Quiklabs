-- `course_labs.lab_id` deja de tener una lista fija en un CHECK: la valida el Worker contra `LAB_IDS`
-- (src/labs/registry.ts), así un laboratorio nuevo ya no necesita una migración. SQLite no permite quitar un CHECK:
-- se reconstruye la tabla conservando los datos (es la última vez).
CREATE TABLE course_labs_new (
  course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lab_id    TEXT NOT NULL CHECK (length(lab_id) BETWEEN 1 AND 16),
  opens_at  TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  mode      TEXT NOT NULL CHECK (mode IN ('PRACTICE', 'GUIDED', 'EVALUATION')),
  PRIMARY KEY (course_id, lab_id),
  CHECK (closes_at > opens_at)
);
INSERT INTO course_labs_new (course_id, lab_id, opens_at, closes_at, mode)
  SELECT course_id, lab_id, opens_at, closes_at, mode FROM course_labs;
DROP TABLE course_labs;
ALTER TABLE course_labs_new RENAME TO course_labs;
