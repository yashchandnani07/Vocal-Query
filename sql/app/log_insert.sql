-- Saves one executed query into voice_log.
-- $1..$5 are placeholders: the app passes the values separately, which keeps
-- user text from ever being treated as SQL (prevents SQL injection).
INSERT INTO voice_log (spoken_text, generated_sql, operation, status, rows_affected)
VALUES ($1, $2, $3, $4, $5);
