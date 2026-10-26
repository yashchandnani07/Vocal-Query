-- Used by: Schema view (center) + the AI (so it knows the tables).
-- information_schema is Postgres' built-in "table about tables".
-- voice_log and database are hidden because they are the app's own tables, not the user's data.
SELECT table_name, column_name, data_type,
       is_nullable                  -- 'NO' means the column is NOT NULL
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name NOT IN ('voice_log', 'database')
ORDER BY table_name, ordinal_position;
