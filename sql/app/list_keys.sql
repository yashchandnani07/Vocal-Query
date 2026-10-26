-- Used by: ER diagram (PK markers + relationship lines) and the Schema view.
-- Returns one row per key column:
--   PRIMARY KEY  -> customers.id
--   FOREIGN KEY  -> orders.customer_id  points to  customers.id
SELECT
  tc.constraint_type,                  -- 'PRIMARY KEY' or 'FOREIGN KEY'
  kcu.table_name,
  kcu.column_name,
  ccu.table_name  AS references_table,  -- only meaningful for FOREIGN KEY
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
  AND kcu.table_name NOT IN ('voice_log', 'database');
