-- The database the user is working with right now = the most recently added one.
-- Every new voice_log row is linked to this id.
SELECT id
FROM database
ORDER BY id DESC
LIMIT 1;
