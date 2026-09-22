-- Base de dades D1 «hechos-leads»: contactes de «¿Tengo caso?» per fer-ne seguiment.
-- S'aplica amb: npx wrangler d1 execute hechos-leads --remote --file schema.sql
-- Dades mínimes: cap nom ni document. Les respostes de negligències són dades de salut
-- (art. 9 RGPD): només es desen amb el consentiment explícit (functions/api/verifica.js).
CREATE TABLE IF NOT EXISTS leads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  creat        TEXT NOT NULL DEFAULT (datetime('now')),
  correu       TEXT NOT NULL,
  idioma       TEXT,
  area         TEXT NOT NULL,
  respostes    TEXT NOT NULL,
  orientacio   TEXT,
  hon_min      INTEGER,
  hon_max      INTEGER,
  recupera_min INTEGER,
  recupera_max INTEGER,
  estat        TEXT NOT NULL DEFAULT 'nou'
);
CREATE INDEX IF NOT EXISTS idx_leads_creat ON leads (creat);
