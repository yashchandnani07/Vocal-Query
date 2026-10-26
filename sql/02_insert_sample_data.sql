-- 02_insert_sample_data.sql  (DML: INSERT)
-- Adds sample rows. We do not write the "id" column: SERIAL fills it in
-- (1, 2, 3 ...) in the order the rows are inserted. That is why the orders
-- below can refer to customer_id 1..6 and product_id 1..6.

INSERT INTO customers (name, city, email) VALUES
  ('Aarav Mehta', 'Mumbai',    'aarav@example.com'),   -- id 1
  ('Diya Sharma', 'Delhi',     'diya@example.com'),    -- id 2
  ('Kabir Singh', 'Bengaluru', 'kabir@example.com'),   -- id 3
  ('Meera Iyer',  'Chennai',   'meera@example.com'),   -- id 4
  ('Rohan Gupta', 'Mumbai',    'rohan@example.com'),   -- id 5
  ('Sara Khan',   'Pune',      'sara@example.com');    -- id 6

INSERT INTO products (name, price, stock) VALUES
  ('Laptop',     55000, 12),   -- id 1
  ('Phone',      22000, 30),   -- id 2
  ('Headphones',  2500, 80),   -- id 3
  ('Keyboard',    1500, 55),   -- id 4
  ('Monitor',    12000, 18),   -- id 5
  ('USB Cable',    300, 200);  -- id 6

INSERT INTO orders (customer_id, product_id, quantity, order_date) VALUES
  (1, 1, 1, '2026-01-05'),
  (1, 3, 2, '2026-01-12'),
  (2, 2, 1, '2026-02-02'),
  (3, 5, 2, '2026-02-14'),
  (3, 4, 1, '2026-03-01'),
  (4, 2, 2, '2026-03-09'),
  (5, 1, 1, '2026-03-20'),
  (5, 6, 5, '2026-04-01'),
  (6, 3, 1, '2026-04-11'),
  (2, 6, 3, '2026-04-18');
