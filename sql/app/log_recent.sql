-- The "Query log" tab: the 20 most recent entries, newest first.
-- LEFT JOIN adds the database name; older rows without a database still appear.
SELECT v.id, v.database_id, d.name AS database_name,
       v.spoken_text, v.generated_sql, v.operation, v.status, v.rows_affected, v.created_at
FROM voice_log v
LEFT JOIN database d ON d.id = v.database_id
ORDER BY v.id DESC
LIMIT 20;
