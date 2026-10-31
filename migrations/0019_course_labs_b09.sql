-- Novena práctica de Biología (b09: arquitectura vegetal): las restricciones de `course_labs` y de
-- `lab_photos` admiten 'b09' (y conservan 'b08'). SQLite no permite modificar un CHECK: se reconstruyen las tablas
-- conservando los datos (las fotos ya subidas y sus claves de R2 no cambian).
CREATE TABLE course_labs_new (
  course_id TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lab_id    TEXT NOT NULL CHECK (lab_id IN ('p01', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08', 'b09')),
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

CREATE TABLE lab_photos_new (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL,
  lab_id       TEXT NOT NULL CHECK (lab_id IN ('b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08', 'b09')),
  asset_id     TEXT NOT NULL,
  objective    INTEGER NOT NULL CHECK (objective IN (4, 10, 40, 100)),
  r2_key       TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  uploaded_by  TEXT NOT NULL REFERENCES users (id),
  uploaded_at  TEXT NOT NULL,
  UNIQUE (scope, lab_id, asset_id, objective)
);
INSERT INTO lab_photos_new (id, scope, lab_id, asset_id, objective, r2_key, content_type, bytes, width, height, uploaded_by, uploaded_at)
  SELECT id, scope, lab_id, asset_id, objective, r2_key, content_type, bytes, width, height, uploaded_by, uploaded_at FROM lab_photos;
DROP TABLE lab_photos;
ALTER TABLE lab_photos_new RENAME TO lab_photos;
CREATE INDEX lab_photos_lab ON lab_photos (lab_id, scope);
