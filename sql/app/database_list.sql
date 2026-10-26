-- The "Databases" tab: every database added so far and how many queries were run on each.
-- LEFT JOIN keeps databases that have no queries yet (they show 0).
SELECT d.id, d.name, d.source, d.file_name, d.created_at,
       COUNT(v.id) AS queries
FROM database d
LEFT JOIN voice_log v ON v.database_id = d.id
GROUP BY d.id
ORDER BY d.id DESC;
