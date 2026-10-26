-- The "Query log" panel: the 20 most recent entries, newest first.
SELECT id, spoken_text, generated_sql, operation, status, rows_affected, created_at
FROM voice_log
ORDER BY id DESC
LIMIT 20;
