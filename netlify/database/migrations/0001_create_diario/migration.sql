-- Tabella che sostituisce il Google Sheet del Diario.
-- Quattro campi di testo liberi, come le quattro colonne del foglio originale.
CREATE TABLE diario (
  id SERIAL PRIMARY KEY,
  data1 TEXT NOT NULL DEFAULT '',
  data2 TEXT NOT NULL DEFAULT '',
  data3 TEXT NOT NULL DEFAULT '',
  data4 TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);
