-- Report completi del workflow "DachPlan Quick".
-- Ogni riga è un sopralluogo in cantiere con tutti i dati raccolti nei 6 step.
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  work_date DATE NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  worker_name TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]',          -- array di immagini base64 (data URL)
  tasks JSONB NOT NULL DEFAULT '[]',            -- array di mansioni selezionate
  materials JSONB NOT NULL DEFAULT '[]',        -- array di materiali selezionati
  sia_categories JSONB NOT NULL DEFAULT '[]',   -- categorie SIA derivate (FLK, Dachpappe, EPS/XPS, ...)
  technical_notes TEXT NOT NULL DEFAULT '',
  time_start TEXT NOT NULL DEFAULT '',          -- HH:MM
  time_end TEXT NOT NULL DEFAULT '',            -- HH:MM
  total_hours NUMERIC(5, 2) NOT NULL DEFAULT 0,
  pause_minutes INTEGER NOT NULL DEFAULT 0,
  final_notes TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL DEFAULT '',           -- firma touch come data URL base64
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indice per il filtro per categoria SIA in lettura.
CREATE INDEX reports_sia_categories_idx ON reports USING GIN (sia_categories);
CREATE INDEX reports_work_date_idx ON reports (work_date DESC);
