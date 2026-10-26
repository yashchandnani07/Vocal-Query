-- Adds one row to the database table whenever a database is loaded or uploaded.
-- RETURNING id gives us the new row's id straight away (no second query needed).
INSERT INTO database (name, source, file_name)
VALUES ($1, $2, $3)
RETURNING id;
