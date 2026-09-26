-- Storage model
-- ------------
-- Raw transactions never reach the server. The browser groups each daily file by raw,
-- *unclassified* dimensions and uploads only the counts. Classification lives in
-- reason_dim: one row per distinct (li_do_dung_sac, eMSP-empty) pair, computed by the
-- shared TypeScript rule engine. Editing a rule recomputes that small table, so the whole
-- history is re-classified without re-uploading anything.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('data_version', '1'),       -- bumped on every write; part of the cache key
  ('new_firmware_from', '260421'); -- builds stamped on/after this yymmdd count as "new" firmware

-- Stop-reason mapping (spec section 4). Seeded from the spec on first use.
CREATE TABLE rules (
  name       TEXT PRIMARY KEY,           -- canonical name, used as the statistics label
  code       TEXT,                       -- SRxxxx, NULL for legacy values
  aliases    TEXT NOT NULL DEFAULT '[]', -- JSON array of alternative spellings
  category   TEXT NOT NULL CHECK (category IN ('EVCS Fault', 'Non-EVCS Fault')),
  source     TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('spec', 'custom')),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE rule_changes (
  id         INTEGER PRIMARY KEY,
  at         TEXT NOT NULL,
  by         TEXT NOT NULL,
  action     TEXT NOT NULL,   -- create | update | delete | reset
  name       TEXT NOT NULL,
  before     TEXT,            -- JSON
  after      TEXT             -- JSON
);

CREATE TABLE reason_dim (
  id         INTEGER PRIMARY KEY,
  reason     TEXT NOT NULL,     -- li_do_dung_sac trimmed; '' when empty
  emsp_empty INTEGER NOT NULL,  -- 1 when ma_giao_dich_tren_emsp is empty
  category   TEXT NOT NULL,
  label      TEXT NOT NULL,
  code       TEXT,
  step       INTEGER NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  UNIQUE (reason, emsp_empty)
);

CREATE TABLE firmware_dim (
  firmware   TEXT PRIMARY KEY,
  build      TEXT,
  generation TEXT NOT NULL,   -- old | new | unknown
  model      TEXT NOT NULL,   -- Core | Kern | AC | Other
  rating_kw  INTEGER,
  manual     INTEGER NOT NULL DEFAULT 0  -- 1 = edited by hand, never auto-recomputed
);

-- ~115 rows per day: drives Overview, Charger faults, Firmware & models.
CREATE TABLE fact_segment (
  date      TEXT NOT NULL,
  firmware  TEXT NOT NULL,
  reason_id INTEGER NOT NULL,
  count     INTEGER NOT NULL,
  PRIMARY KEY (date, firmware, reason_id)
) WITHOUT ROWID;

-- ~4,800 rows per day: drives Stations only.
CREATE TABLE fact_station (
  date      TEXT NOT NULL,
  station   TEXT NOT NULL,
  reason_id INTEGER NOT NULL,
  count     INTEGER NOT NULL,
  PRIMARY KEY (date, station, reason_id)
) WITHOUT ROWID;

CREATE TABLE uploads (
  date        TEXT PRIMARY KEY,
  file_name   TEXT NOT NULL,
  total_rows  INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'complete')),
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL
);
