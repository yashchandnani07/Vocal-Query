-- insert_update_delete_examples.sql  (DML + DDL) - for studying; the app does not run this file.
-- The assistant asks you to confirm before running any of these.

-- "Add a customer named Neha from Jaipur"                  (INSERT)
INSERT INTO customers (name, city, email) VALUES ('Neha Verma', 'Jaipur', 'neha@example.com');

-- "Change the price of the keyboard to 1800"               (UPDATE)
UPDATE products SET price = 1800 WHERE name = 'Keyboard';

-- "Delete the order with id 10"                            (DELETE)
DELETE FROM orders WHERE id = 10;

-- "Add a city column to products"                          (DDL: ALTER TABLE)
ALTER TABLE products ADD COLUMN category VARCHAR(50);

-- DANGER: UPDATE or DELETE with no WHERE touches EVERY row.
-- The app marks these red and asks you to confirm.
-- DELETE FROM orders;

-- DANGER: DROP removes the whole table, rows and structure.
-- DROP TABLE orders;
