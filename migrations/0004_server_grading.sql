-- Validación de notas en el servidor. La nota (`score`, `components`) la calcula ahora el Worker con la rúbrica a
-- partir del estado final entregado; `client_score` guarda la que calculó el navegador, solo para comparar.
--   grading: 'CLIENT' (entregas anteriores: nota calculada por el navegador) · 'SERVER' (recalculada en el servidor)
--   issues:  JSON con los problemas de plausibilidad detectados (semilla, parámetros, conservación, reloj, modo…)
--   replay:  JSON con el resultado de la repetición del intento hecha por un docente (null si no se repitió)
ALTER TABLE submissions ADD COLUMN client_score REAL;
ALTER TABLE submissions ADD COLUMN grading TEXT NOT NULL DEFAULT 'CLIENT' CHECK (grading IN ('CLIENT', 'SERVER'));
ALTER TABLE submissions ADD COLUMN issues TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN replay TEXT;

-- Estado entregado y cinta de comandos (JSON comprimido con gzip, en base64), en partes de hasta 1 MB porque D1
-- limita el tamaño de cada valor. kind: 'snapshot' | 'tape' | 'options'.
CREATE TABLE submission_data (
  submission_id TEXT NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('snapshot', 'tape', 'options')),
  part          INTEGER NOT NULL,
  data          TEXT NOT NULL,
  PRIMARY KEY (submission_id, kind, part)
);
