-- 03_create_app_tables.sql  (DDL: CREATE TABLE, ALTER TABLE)
-- The app's OWN database: two tables, linked by a foreign key.
--
--   database 1 ------ N voice_log
--
--   database   one row for every database a user loads or uploads
--              (the demo shop, an uploaded .sql file, or "existing tables")
--   voice_log  one row for every query that was run, with what the user said and the SQL
--              that was made from it. database_id says which database the query ran on.
--
-- This file is safe to run on every start: IF NOT EXISTS skips tables that already exist.
-- Look at the data any time with:   SELECT * FROM database;   SELECT * FROM voice_log ORDER BY id DESC;

CREATE TABLE IF NOT EXISTS database (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,                              -- e.g. 'Demo shop' or the uploaded file name
  source     VARCHAR(10) NOT NULL
             CHECK (source IN ('demo', 'upload', 'existing')),   -- where the database came from
  file_name  VARCHAR(200),                                       -- the .sql file, for uploads only
  created_at TIMESTAMP NOT NULL DEFAULT NOW()                    -- when it was added
);

CREATE TABLE IF NOT EXISTS voice_log (
  id            SERIAL PRIMARY KEY,
  database_id   INTEGER REFERENCES database(id),     -- FOREIGN KEY: which database the query ran on
  spoken_text   TEXT,                                -- what the user said / typed
  generated_sql TEXT NOT NULL,                       -- the SQL that was run
  operation     VARCHAR(10) NOT NULL,                -- SELECT, INSERT, UPDATE, ...
  status        VARCHAR(10) NOT NULL,                -- OK or ERROR
  rows_affected INTEGER,                             -- rows returned or changed
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()     -- when it happened
);

-- Upgrade for an older voice_log that was created before the database table existed:
-- add the column, give the old rows a 'Demo database' row, and link them to it.
ALTER TABLE voice_log ADD COLUMN IF NOT EXISTS database_id INTEGER REFERENCES database(id);

INSERT INTO database (name, source)
SELECT 'Demo database', 'demo'
WHERE NOT EXISTS (SELECT 1 FROM database)
  AND EXISTS (SELECT 1 FROM voice_log WHERE database_id IS NULL);

UPDATE voice_log
SET database_id = (SELECT MIN(id) FROM database)
WHERE database_id IS NULL
  AND EXISTS (SELECT 1 FROM database);
