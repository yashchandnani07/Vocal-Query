-- select_examples.sql  (DML: SELECT) - for studying; the app does not run this file.
-- These are the kinds of queries the voice assistant writes for you.
-- Try saying the sentence in the comment, then compare with the SQL below.

-- "Show all customers"
SELECT * FROM customers;

-- "Customers in Mumbai"                       (WHERE filters rows)
SELECT * FROM customers WHERE city = 'Mumbai';

-- "Most expensive products first"            (ORDER BY sorts)
SELECT name, price FROM products ORDER BY price DESC;

-- "How many orders are there"                (COUNT is an aggregate function)
SELECT COUNT(*) AS total_orders FROM orders;

-- "Which customer bought what"               (JOIN combines tables via foreign keys)
SELECT c.name AS customer, p.name AS product, o.quantity
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products  p ON p.id = o.product_id;

-- "Total spent by each customer"             (GROUP BY + SUM)
SELECT c.name, SUM(p.price * o.quantity) AS total_spent
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products  p ON p.id = o.product_id
GROUP BY c.name
ORDER BY total_spent DESC;

-- "Customers who spent more than 20000"      (HAVING filters groups, WHERE filters rows)
SELECT c.name, SUM(p.price * o.quantity) AS total_spent
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products  p ON p.id = o.product_id
GROUP BY c.name
HAVING SUM(p.price * o.quantity) > 20000;
