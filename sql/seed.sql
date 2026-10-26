-- Datos sintéticos propios; reference_now permite repetir los bordes temporales.
\if :{?reference_now}
\else
  SELECT CURRENT_TIMESTAMP::text AS reference_now \gset
\endif

CREATE TEMP TABLE fixture_clock AS
SELECT :'reference_now'::timestamptz AS reference_now,
       DATE_TRUNC('month', :'reference_now'::timestamptz AT TIME ZONE 'America/Bogota') AS month_start;

INSERT INTO rooms (id, name, size, hourly_rate) VALUES
  (1, 'Cobros', 'small', 40000),
  (2, 'Cruces', 'medium', 70000),
  (3, 'Meses', 'large', 120000),
  (4, 'Sin reservas', 'small', 40000);
INSERT INTO customers (id, email, full_name, company) VALUES
  (1, 'ada@example.com', 'Ada', 'Empresa A'),
  (2, 'bruno@example.com', 'Bruno', NULL),
  (3, 'clara@example.com', 'Clara', 'Empresa C'),
  (4, 'diana@example.com', 'Diana', 'Empresa D');

INSERT INTO bookings (id, customer_id, room_id, starts_at, ends_at, created_at, total, status, payment_status)
SELECT id, customer_id, 1, reference_now - age - INTERVAL '1 hour', reference_now - age,
       reference_now - age - INTERVAL '24 hours', total, status, payment_status
FROM fixture_clock CROSS JOIN (VALUES
  (101, 1, INTERVAL '2160 hours', 100, 'completed', 'unpaid'),
  (102, 1, INTERVAL '1440 hours', 100, 'completed', 'partial'),
  (103, 1, INTERVAL '240 hours', 1000, 'completed', 'unpaid'),
  (104, 1, INTERVAL '720 hours', 900, 'completed', 'unpaid'),
  (105, 1, INTERVAL '2880 hours', 100, 'completed', 'paid'),
  (106, 1, INTERVAL '960 hours', 100, 'completed', 'paid'),
  (107, 2, INTERVAL '1080 hours', 200, 'completed', 'unpaid'),
  (108, 2, INTERVAL '1200 hours', 900, 'confirmed', 'unpaid'),
  (109, 2, INTERVAL '1320 hours', 900, 'cancelled', 'unpaid'),
  (110, 2, INTERVAL '1560 hours', 900, 'draft', 'unpaid'),
  (111, 4, INTERVAL '744 hours', 150, 'completed', 'unpaid'),
  (112, 3, INTERVAL '719 hours 59 minutes 59 seconds', 100, 'completed', 'unpaid'),
  (113, 3, INTERVAL '720 hours 1 second', 25, 'completed', 'unpaid'),
  (114, 3, INTERVAL '1680 hours', 0, 'completed', 'paid'),
  (115, 3, INTERVAL '1920 hours', 100, 'completed', 'paid')
) AS fixture(id, customer_id, age, total, status, payment_status);

INSERT INTO bookings (id, customer_id, room_id, starts_at, ends_at, created_at, total, status, payment_status)
SELECT id, 3, room_id,
       (month_start + start_time) AT TIME ZONE 'America/Bogota',
       (month_start + end_time) AT TIME ZONE 'America/Bogota',
       reference_now, total, status, 'unpaid'
FROM fixture_clock CROSS JOIN (VALUES
  (201, 2, INTERVAL '9 hours', INTERVAL '11 hours', 200, 'confirmed'),
  (202, 2, INTERVAL '10 hours', INTERVAL '12 hours', 200, 'completed'),
  (203, 2, INTERVAL '10 hours 30 minutes', INTERVAL '11 hours 30 minutes', 100, 'confirmed'),
  (204, 2, INTERVAL '12 hours', INTERVAL '13 hours', 100, 'confirmed'),
  (205, 2, INTERVAL '9 hours 30 minutes', INTERVAL '13 hours', 350, 'cancelled'),
  (206, 2, INTERVAL '9 hours 30 minutes', INTERVAL '13 hours', 350, 'draft'),
  (207, 1, INTERVAL '9 hours', INTERVAL '11 hours', 200, 'confirmed'),
  (208, 2, INTERVAL '9 hours 30 minutes', INTERVAL '13 hours', 350, NULL)
) AS fixture(id, room_id, start_time, end_time, total, status);

INSERT INTO bookings (id, customer_id, room_id, starts_at, ends_at, created_at, total, status, payment_status)
SELECT id, 3, 3, starts_at, starts_at + duration, reference_now, total, status, 'unpaid'
FROM fixture_clock CROSS JOIN LATERAL (VALUES
  (301, (month_start - INTERVAL '11 months') AT TIME ZONE 'America/Bogota', INTERVAL '1 hour 30 minutes', 150.25, 'confirmed'),
  (302, (month_start - INTERVAL '11 months') AT TIME ZONE 'America/Bogota' - INTERVAL '1 second', INTERVAL '30 minutes', 50, 'completed'),
  (303, (month_start - INTERVAL '1 hour') AT TIME ZONE 'America/Bogota', INTERVAL '2 hours', 200, 'completed'),
  (304, (month_start + INTERVAL '30 minutes') AT TIME ZONE 'America/Bogota', INTERVAL '30 minutes', 50, 'confirmed'),
  (305, (month_start - INTERVAL '1 month' + INTERVAL '10 hours') AT TIME ZONE 'America/Bogota', INTERVAL '2 hours 30 minutes', 250, 'cancelled'),
  (306, (month_start - INTERVAL '2 months') AT TIME ZONE 'America/Bogota', INTERVAL '1 hour', 100, 'draft'),
  (307, reference_now + INTERVAL '1 second', INTERVAL '1 hour', 999, 'confirmed'),
  (308, (month_start - INTERVAL '12 months') AT TIME ZONE 'America/Bogota', INTERVAL '1 hour', 999, 'confirmed'),
  (309, (month_start - INTERVAL '11 months') AT TIME ZONE 'America/Bogota' - INTERVAL '1 second', INTERVAL '2 hours', 999, 'confirmed'),
  (310, reference_now, INTERVAL '1 hour', 100, 'confirmed')
) AS fixture(id, starts_at, duration, total, status);

INSERT INTO bookings (id, starts_at, ends_at, created_at, total, status, payment_status)
SELECT id, reference_now, reference_now + INTERVAL '1 hour', reference_now, total, 'draft', payment_status
FROM fixture_clock CROSS JOIN (VALUES
  (401, 100, 'paid'), (402, 100, 'paid'), (403, 100, 'unpaid'),
  (404, 100, 'partial'), (405, 100, 'paid'), (406, 0, 'paid'),
  (407, 100, 'paid'), (408, 100, NULL), (409, 100, 'paid')
) AS fixture(id, total, payment_status);

INSERT INTO booking_lines (booking_id, concept, amount)
SELECT id, 'base', total FROM bookings WHERE id < 400;
INSERT INTO booking_lines (booking_id, concept, amount) VALUES
  (401, 'base', 40), (401, 'servicios', 50),
  (402, 'base', 110), (402, 'descuento', -10),
  (404, 'base', 100), (405, 'base', 100),
  (407, 'base', 100), (408, 'base', 90), (409, 'base', 80);

-- paid_at y amount son anulables en el DDL; cada fila monetaria cuenta, aun sin paid_at.
INSERT INTO payments (booking_id, amount, external_event_id, paid_at) VALUES
  (102, 20, 'p102a', NULL), (102, 30, 'p102b', '2020-01-01T00:00:00Z'), (102, NULL, 'p102c', NULL),
  (105, 150, 'p105', NULL), (106, 100, 'p106', NULL),
  (115, 120, 'p115a', NULL), (115, -20, 'p115b', NULL),
  (401, 20, 'p401a', NULL), (401, 30, 'p401b', NULL),
  (402, 40, 'p402a', NULL), (402, 60, 'p402b', NULL),
  (404, 20, 'p404a', NULL), (404, 30, 'p404b', NULL),
  (405, 110, 'p405', NULL), (407, NULL, 'p407', NULL), (409, 100, 'p409', NULL);

INSERT INTO payments (booking_id, amount)
SELECT id, total FROM bookings WHERE id BETWEEN 200 AND 399;

SELECT SETVAL(PG_GET_SERIAL_SEQUENCE('rooms', 'id'), (SELECT MAX(id) FROM rooms));
SELECT SETVAL(PG_GET_SERIAL_SEQUENCE('customers', 'id'), (SELECT MAX(id) FROM customers));
SELECT SETVAL(PG_GET_SERIAL_SEQUENCE('bookings', 'id'), (SELECT MAX(id) FROM bookings));
