-- 01_create_tables.sql  (DDL: CREATE TABLE)
-- Three tables: customers, products, orders.
--
--   customers 1 ---- many orders many ---- 1 products
--
-- Concepts used: PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT, CHECK, FOREIGN KEY.

CREATE TABLE customers (
  id     SERIAL PRIMARY KEY,        -- SERIAL = auto-increasing number (1, 2, 3 ...)
  name   VARCHAR(100) NOT NULL,     -- NOT NULL = a value is required
  city   VARCHAR(50),
  email  VARCHAR(100) UNIQUE        -- UNIQUE = no two customers share an email
);

CREATE TABLE products (
  id     SERIAL PRIMARY KEY,
  name   VARCHAR(100) NOT NULL,
  price  NUMERIC(10, 2) NOT NULL CHECK (price >= 0),   -- CHECK = rule on the value
  stock  INTEGER NOT NULL DEFAULT 0                    -- DEFAULT = used if not given
);

CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),  -- FOREIGN KEY to customers
  product_id   INTEGER NOT NULL REFERENCES products(id),   -- FOREIGN KEY to products
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  order_date   DATE NOT NULL
);
