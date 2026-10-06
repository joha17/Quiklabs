-- Práctica 5 (relaciones estequiométricas): la restricción de laboratorios admite 'p5'.
-- SQLite no permite modificar un CHECK: se reconstruye la tabla conservando los datos.
CREATE TABLE course_labs_new (
  course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lab_id    TEXT NOT NULL CHECK (lab_id IN ('p2', 'p3', 'p4', 'p5')),
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
