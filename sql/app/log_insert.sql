-- Saves one executed query into voice_log.
-- $1..$6 are placeholders: the app passes the values separately, which keeps
-- user text from ever being treated as SQL (prevents SQL injection).
-- $6 is the id of the row in the database table that this query ran on.
INSERT INTO voice_log (spoken_text, generated_sql, operation, status, rows_affected, database_id)
VALUES ($1, $2, $3, $4, $5, $6);
