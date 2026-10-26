-- 03_create_log_table.sql  (DDL: CREATE TABLE)
-- Everything the user says to the assistant is saved here, together with the
-- SQL that was made from it. This is the only data the app itself stores.
-- Look at it any time with:   SELECT * FROM voice_log ORDER BY id DESC;

CREATE TABLE IF NOT EXISTS voice_log (
  id            SERIAL PRIMARY KEY,
  spoken_text   TEXT,                                  -- what the user said / typed
  generated_sql TEXT NOT NULL,                         -- the SQL that was run
  operation     VARCHAR(10) NOT NULL,                  -- SELECT, INSERT, UPDATE, ...
  status        VARCHAR(10) NOT NULL,                  -- OK or ERROR
  rows_affected INTEGER,                               -- rows returned or changed
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()       -- when it happened
);
