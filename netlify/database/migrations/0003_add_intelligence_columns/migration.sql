-- Roll-forward migration: persiste gli output del motore intelligente.
-- Le migrazioni 0001/0002 restano immutabili; qui aggiungiamo solo colonne.
-- weather    → condizioni ambientali inserite (temperatura, vento, precipitazioni)
-- risks      → array di rischi previsti dal motore
-- logistics  → previsione consumi / ordini / durata stimata / ritardo
-- anomalies  → array di anomalie rilevate
-- workflow   → fasi di lavorazione derivate dalle mansioni
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS weather   JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risks     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS logistics JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS anomalies JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS workflow  JSONB NOT NULL DEFAULT '[]';
