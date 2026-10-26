-- Used by: Schema view (center) + the AI (so it knows the tables).
-- information_schema is Postgres' built-in "table about tables".
-- voice_log is hidden because it is the app's own log, not the user's data.
SELECT table_name, column_name, data_type,
       is_nullable                  -- 'NO' means the column is NOT NULL
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name <> 'voice_log'
ORDER BY table_name, ordinal_position;
