-- 00_drop_tables.sql  (DDL: DROP)
-- Deletes the lab tables so we can start fresh. Used by the "Reset DB" button.
-- Order matters: "orders" points to customers and products (foreign keys),
-- so it must be dropped first.

DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;
