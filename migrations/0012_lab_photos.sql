-- Fotografías reales del ocular (B01/B02): una por muestra y objetivo. `scope` es el id del curso (fotos del docente)
-- o '*' (juego general de la administración, para los cursos que no tienen la suya). El archivo vive en R2 (`r2_key`);
-- aquí solo sus datos. Subir otra foto al mismo espacio reemplaza la fila (y se borra el objeto anterior).
CREATE TABLE lab_photos (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL,
  lab_id       TEXT NOT NULL CHECK (lab_id IN ('b01', 'b02')),
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
CREATE INDEX lab_photos_lab ON lab_photos (lab_id, scope);
