-- Octava práctica de Física (f08: rotación de cuerpos rígidos y momento de inercia): la restricción de `course_labs` admite
-- 'f08'. SQLite no permite modificar un CHECK: se reconstruye la tabla conservando los datos.
-- F08 no usa fotos, así que `lab_photos` no cambia.
CREATE TABLE course_labs_new (
  course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lab_id    TEXT NOT NULL CHECK (lab_id IN ('p01', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08', 'b09', 'b10', 'f101', 'f102', 'f103', 'f04', 'f05', 'f06', 'f07', 'f08')),
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
