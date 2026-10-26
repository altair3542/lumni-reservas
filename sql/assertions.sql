CREATE FUNCTION pg_temp.assert_same(label text, actual regclass, expected regclass)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE different boolean;
BEGIN
  EXECUTE FORMAT('SELECT EXISTS ((TABLE %s EXCEPT ALL TABLE %s) UNION ALL (TABLE %s EXCEPT ALL TABLE %s))',
                 actual, expected, expected, actual) INTO different;
  IF different THEN RAISE EXCEPTION '%: resultado distinto del esperado', label; END IF;
  RAISE NOTICE '%: OK', label;
END;
$$;

CREATE TEMP TABLE expected_1 (email text, full_name text, company text, outstanding_balance numeric, days_overdue int);
INSERT INTO expected_1 VALUES
  ('bruno@example.com', 'Bruno', NULL, 200, 45),
  ('ada@example.com', 'Ada', 'Empresa A', 150, 90),
  ('diana@example.com', 'Diana', 'Empresa D', 150, 31),
  ('clara@example.com', 'Clara', 'Empresa C', 25, 30);
SELECT pg_temp.assert_same('D01 saldos y frontera de 30 días', 'actual_1', 'expected_1');

CREATE TEMP TABLE expected_2 (booking_id_1 int, booking_id_2 int);
INSERT INTO expected_2 VALUES
  (104, 112), (104, 113), (112, 113),
  (201, 202), (201, 203), (202, 203),
  (301, 302), (301, 309), (302, 309), (303, 304), (307, 310);
INSERT INTO expected_2
SELECT a, b FROM fixture_clock CROSS JOIN (VALUES
  (303, 307), (303, 310), (304, 307), (304, 310)
) AS extra(a, b)
WHERE reference_now = (month_start + INTERVAL '30 minutes') AT TIME ZONE 'America/Bogota';
SELECT pg_temp.assert_same('D02 cruces sin contiguos, espejos ni estados excluidos', 'actual_2', 'expected_2');

CREATE TEMP TABLE expected_months AS
SELECT (month_start - INTERVAL '11 months' + n * INTERVAL '1 month')::date AS month
FROM fixture_clock CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11)) AS offsets(n);
CREATE TEMP TABLE actual_matrix AS SELECT room_id, room_name, month FROM actual_3;
CREATE TEMP TABLE expected_matrix AS
SELECT r.id AS room_id, r.name AS room_name, m.month FROM rooms r CROSS JOIN expected_months m;
SELECT pg_temp.assert_same('D03 matriz completa de 4 salas por 12 meses', 'actual_matrix', 'expected_matrix');

CREATE TEMP TABLE expected_monthly AS
SELECT 3 AS room_id, 'Meses'::text AS room_name, m.month,
       CASE WHEN m.month = (clock.month_start - INTERVAL '11 months')::date THEN 1.5
            WHEN m.month = (clock.month_start - INTERVAL '1 month')::date THEN 2
            WHEN m.month = clock.month_start::date THEN 1.5 ELSE 0 END::numeric AS reserved_hours,
       CASE WHEN m.month = (clock.month_start - INTERVAL '11 months')::date THEN 150.25
            WHEN m.month = (clock.month_start - INTERVAL '1 month')::date THEN 200
            WHEN m.month = clock.month_start::date THEN 150 ELSE 0 END::numeric AS revenue
FROM expected_months m CROSS JOIN fixture_clock clock;
CREATE TEMP TABLE actual_monthly AS SELECT * FROM actual_3 WHERE room_id = 3;
SELECT pg_temp.assert_same('D03 límites UTC/Colombia, fracciones, cruces de mes y futuro', 'actual_monthly', 'expected_monthly');

CREATE TEMP TABLE expected_empty AS
SELECT 4 AS room_id, 'Sin reservas'::text AS room_name, month, 0::numeric AS reserved_hours, 0::numeric AS revenue
FROM expected_months;
CREATE TEMP TABLE actual_empty AS SELECT * FROM actual_3 WHERE room_id = 4;
SELECT pg_temp.assert_same('D03 sala vacía con doce ceros', 'actual_empty', 'expected_empty');

CREATE TEMP TABLE actual_totals AS
SELECT room_id, SUM(reserved_hours) AS hours, SUM(revenue) AS revenue FROM actual_3 GROUP BY room_id;
CREATE TEMP TABLE expected_totals (room_id int, hours numeric, revenue numeric);
INSERT INTO expected_totals
SELECT 1, CASE WHEN reference_now > (month_start + INTERVAL '13 hours') AT TIME ZONE 'America/Bogota' THEN 15 ELSE 13 END,
          CASE WHEN reference_now > (month_start + INTERVAL '13 hours') AT TIME ZONE 'America/Bogota' THEN 3975 ELSE 3775 END
FROM fixture_clock;
INSERT INTO expected_totals
SELECT 2, CASE WHEN reference_now > (month_start + INTERVAL '13 hours') AT TIME ZONE 'America/Bogota' THEN 6 ELSE 0 END,
          CASE WHEN reference_now > (month_start + INTERVAL '13 hours') AT TIME ZONE 'America/Bogota' THEN 600 ELSE 0 END
FROM fixture_clock;
INSERT INTO expected_totals VALUES (3, 5, 500.25), (4, 0, 0);
SELECT pg_temp.assert_same('D03 conservación de horas/ingresos por todas las salas', 'actual_totals', 'expected_totals');

CREATE TEMP TABLE expected_4 (booking_id int, total numeric, lines_total numeric, paid_total numeric,
                             lines_mismatch boolean, paid_not_covered boolean);
INSERT INTO expected_4 VALUES
  (401, 100, 90, 50, TRUE, TRUE),
  (403, 100, 0, 0, TRUE, FALSE),
  (407, 100, 100, 0, FALSE, TRUE),
  (408, 100, 90, 0, TRUE, FALSE),
  (409, 100, 80, 100, TRUE, FALSE);
SELECT pg_temp.assert_same('D04 líneas, pagos y ambas causas sin multiplicar importes', 'actual_4', 'expected_4');

-- La comparación de conjuntos anterior no valida el ORDER BY.
DO $$
BEGIN
  IF (SELECT ARRAY_AGG(email) FROM actual_1) IS DISTINCT FROM
     ARRAY['bruno@example.com','ada@example.com','diana@example.com','clara@example.com'] THEN
    RAISE EXCEPTION 'D01: orden de saldo/desempate incorrecto';
  END IF;
  RAISE NOTICE 'D01 orden descendente y desempate: OK';
END;
$$;
