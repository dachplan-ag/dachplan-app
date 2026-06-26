-- 0004_create_warehouse
-- DachPlan OS — Magazzino Automatico (CPN 351 Lattoneria / CPN 364 Impermeabilizzazioni).
-- Inventory of materials/consumables/tools, automatic supplier orders, and the
-- operator work log that drives background consumption.

CREATE TABLE IF NOT EXISTS inventory (
  id            TEXT PRIMARY KEY,                       -- MAT001 / CON001 / ATZ001
  nome          TEXT NOT NULL,
  categoria     TEXT NOT NULL,                          -- materiali / consumabili / attrezzi
  unita         TEXT NOT NULL,                          -- kg / g / m / pz / bool
  stock         NUMERIC NOT NULL DEFAULT 0,
  soglia_minima NUMERIC NOT NULL DEFAULT 0,
  reorder_qty   NUMERIC NOT NULL DEFAULT 0,             -- quantity proposed on auto-order
  ordine_auto   BOOLEAN NOT NULL DEFAULT TRUE,
  disponibile   BOOLEAN NOT NULL DEFAULT TRUE,          -- boolean state for tools (ATZ)
  fornitore     TEXT NOT NULL DEFAULT 'Default',
  updated_at    TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auto_orders (
  id             SERIAL PRIMARY KEY,
  fornitore      TEXT NOT NULL DEFAULT 'Default',
  materiale_id   TEXT NOT NULL,
  materiale_nome TEXT NOT NULL,
  quantita       NUMERIC NOT NULL,
  stock_attuale  NUMERIC NOT NULL,
  soglia_minima  NUMERIC NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',       -- pending / sent / received
  created_at     TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_orders_material_status
  ON auto_orders (materiale_id, status);

CREATE TABLE IF NOT EXISTS work_logs (
  id                 SERIAL PRIMARY KEY,
  oggetto_id         INTEGER NOT NULL,
  oggetto_nome       TEXT NOT NULL,
  sistema            TEXT NOT NULL DEFAULT '1K',        -- 1K / 2K
  quantita           NUMERIC NOT NULL DEFAULT 0,
  vlies_m            NUMERIC NOT NULL DEFAULT 0,
  glass_vlies_m      NUMERIC NOT NULL DEFAULT 0,
  montaggio_scarichi BOOLEAN NOT NULL DEFAULT FALSE,
  consumi            JSONB NOT NULL DEFAULT '{}'::jsonb, -- resolved material consumption
  created_at         TIMESTAMP DEFAULT now()
);

-- Seed magazzino. ON CONFLICT keeps the migration idempotent and never
-- overwrites live stock if it is re-run on a fresh branch.
INSERT INTO inventory (id, nome, categoria, unita, stock, soglia_minima, reorder_qty, ordine_auto, disponibile) VALUES
  ('MAT001', 'Resina FLK',            'materiali',   'kg', 250,   20,   300, TRUE,  TRUE),
  ('MAT002', 'Catalizzatore',         'materiali',   'g',  15000, 1000, 5000, TRUE, TRUE),
  ('MAT003', 'FLK-Vlies',             'materiali',   'm',  500,   50,   300, TRUE,  TRUE),
  ('MAT004', 'Glass-Vlies',           'materiali',   'm',  500,   50,   300, TRUE,  TRUE),
  ('MAT005', 'Primer Metallo Spray',  'materiali',   'pz', 40,    10,   48,  TRUE,  TRUE),
  ('CON001', 'Schleifscheibe Beton',  'consumabili', 'pz', 50,    10,   50,  TRUE,  TRUE),
  ('CON002', 'Schleifpapier',         'consumabili', 'pz', 100,   20,   100, TRUE,  TRUE),
  ('CON003', 'Flexscheibe',           'consumabili', 'pz', 60,    15,   50,  TRUE,  TRUE),
  ('CON004', 'Schlagdübel',           'consumabili', 'pz', 500,   100,  500, TRUE,  TRUE),
  ('CON005', 'Fassaden-Dübel',        'consumabili', 'pz', 500,   100,  500, TRUE,  TRUE),
  ('CON006', 'Pennelli',              'consumabili', 'pz', 80,    20,   50,  TRUE,  TRUE),
  ('CON007', 'Rulli',                 'consumabili', 'pz', 80,    20,   50,  TRUE,  TRUE),
  ('CON008', 'Guanti da lavoro',      'consumabili', 'pz', 200,   40,   100, TRUE,  TRUE),
  ('ATZ001', 'Flex (Smerigliatrice)', 'attrezzi',    'bool', 0,   0,    0,   FALSE, TRUE),
  ('ATZ002', 'Bohrmaschine',          'attrezzi',    'bool', 0,   0,    0,   FALSE, TRUE),
  ('ATZ003', 'Bohrer',                'attrezzi',    'bool', 0,   0,    0,   FALSE, TRUE),
  ('ATZ004', 'Hammer',                'attrezzi',    'bool', 0,   0,    0,   FALSE, TRUE),
  ('ATZ005', 'Meter',                 'attrezzi',    'bool', 0,   0,    0,   FALSE, TRUE),
  ('ATZ006', 'Brenner',               'attrezzi',    'bool', 0,   0,    0,   FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;
