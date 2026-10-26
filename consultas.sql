-- 1. Saldos de reservas completed terminadas hace más de 30 días completos.
WITH parameters AS (
  SELECT CURRENT_TIMESTAMP AS reference_now
), payments_by_booking AS (
  SELECT booking_id, SUM(amount) AS paid
  FROM payments
  GROUP BY booking_id
), overdue AS (
  SELECT b.customer_id, b.ends_at, b.total - COALESCE(p.paid, 0) AS balance
  FROM bookings b
  LEFT JOIN payments_by_booking p ON p.booking_id = b.id
  CROSS JOIN parameters clock
  WHERE b.status = 'completed'
    AND b.ends_at < clock.reference_now - INTERVAL '720 hours'
    AND b.total - COALESCE(p.paid, 0) > 0
)
SELECT c.email, c.full_name, c.company,
       SUM(o.balance) AS outstanding_balance,
       FLOOR(EXTRACT(EPOCH FROM (clock.reference_now - MIN(o.ends_at))) / 86400)::int AS days_overdue
FROM overdue o
JOIN customers c ON c.id = o.customer_id
CROSS JOIN parameters clock
GROUP BY c.id, c.email, c.full_name, c.company, clock.reference_now
ORDER BY outstanding_balance DESC, c.id;

-- 2. Extremos estrictos: [inicio, fin); cada par aparece una sola vez.
SELECT a.id AS booking_id_1, b.id AS booking_id_2
FROM bookings a
JOIN bookings b ON a.room_id = b.room_id AND a.id < b.id
WHERE a.status IN ('confirmed', 'completed')
  AND b.status IN ('confirmed', 'completed')
  AND a.starts_at < b.ends_at
  AND b.starts_at < a.ends_at
ORDER BY a.id, b.id;

-- 3. Mes actual hasta ahora y once anteriores, en Colombia.
-- Horas e ingreso completos se atribuyen al mes de inicio, incluso si cruzan mes.
WITH parameters AS (
  SELECT CURRENT_TIMESTAMP AS reference_now
), bounds AS (
  SELECT reference_now,
         DATE_TRUNC('month', reference_now AT TIME ZONE 'America/Bogota') AS current_month
  FROM parameters
), months AS (
  SELECT GENERATE_SERIES(current_month - INTERVAL '11 months', current_month, INTERVAL '1 month')::date AS month
  FROM bounds
), monthly_bookings AS (
  SELECT b.room_id,
         DATE_TRUNC('month', b.starts_at AT TIME ZONE 'America/Bogota')::date AS month,
         SUM(EXTRACT(EPOCH FROM (b.ends_at - b.starts_at)) / 3600) AS reserved_hours,
         SUM(b.total) AS revenue
  FROM bookings b
  CROSS JOIN bounds clock
  WHERE b.status IN ('confirmed', 'completed')
    AND b.starts_at >= (clock.current_month - INTERVAL '11 months') AT TIME ZONE 'America/Bogota'
    AND b.starts_at <= clock.reference_now
  GROUP BY b.room_id, DATE_TRUNC('month', b.starts_at AT TIME ZONE 'America/Bogota')::date
)
SELECT r.id AS room_id, r.name AS room_name, m.month,
       COALESCE(b.reserved_hours, 0) AS reserved_hours,
       COALESCE(b.revenue, 0) AS revenue
FROM rooms r
CROSS JOIN months m
LEFT JOIN monthly_bookings b ON b.room_id = r.id AND b.month = m.month
ORDER BY r.id, m.month;

-- 4. Agregar líneas y pagos por separado evita multiplicarlos al unirlos.
WITH lines_by_booking AS (
  SELECT booking_id, SUM(amount) AS lines_total
  FROM booking_lines
  GROUP BY booking_id
), payments_by_booking AS (
  SELECT booking_id, SUM(amount) AS paid_total
  FROM payments
  GROUP BY booking_id
), checked AS (
  SELECT b.id AS booking_id, b.total,
         COALESCE(l.lines_total, 0) AS lines_total,
         COALESCE(p.paid_total, 0) AS paid_total,
         b.total <> COALESCE(l.lines_total, 0) AS lines_mismatch,
         COALESCE(b.payment_status = 'paid', FALSE)
           AND COALESCE(p.paid_total, 0) < b.total AS paid_not_covered
  FROM bookings b
  LEFT JOIN lines_by_booking l ON l.booking_id = b.id
  LEFT JOIN payments_by_booking p ON p.booking_id = b.id
)
SELECT booking_id, total, lines_total, paid_total, lines_mismatch, paid_not_covered
FROM checked
WHERE lines_mismatch OR paid_not_covered
ORDER BY booking_id;

-- 5. Evaluaría payments(booking_id) INCLUDE (amount) y booking_lines(booking_id) INCLUDE (amount).
-- Primero revisaría índices existentes y EXPLAIN (ANALYZE, BUFFERS) de la consulta 4.
-- Compararía antes/después con igual consulta, datos representativos, estadísticas actualizadas y varias ejecuciones.
-- Mediría tiempo, buffers, filas estimadas/reales y heap fetches; INCLUDE depende también de VACUUM y la visibilidad.
-- Una agregación completa puede preferir scan secuencial; conservaría solo índices cuya mejora compense escrituras y espacio.
