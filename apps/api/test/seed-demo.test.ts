import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { quoteSchema } from '@lumni/shared';
import { seedDemoBookings, demoRequestId } from '../src/db/seed-demo.js';
import { DEMO_CLIENT_ID, DEMO_ROOM_ID } from '../src/db/seed.js';
import { BookingService } from '../src/bookings/service.js';
import { EmailWorker } from '../src/emails/service.js';
import { openTestDatabase, prepareDatabase, resetDatabase } from './helpers.js';

const database = openTestDatabase();
const now = new Date('2026-10-23T17:00:00Z');
beforeAll(() => prepareDatabase(database));
beforeEach(() => resetDatabase(database));
afterAll(() => database.pool.end());

it('crea ejemplos de los cuatro estados, precios reales, líneas coherentes y correo procesable', async () => {
  expect(await seedDemoBookings(database, now)).toEqual({ created: 24, existing: 0, skipped: 0 });
  expect(
    (
      await database.pool.query(
        'SELECT status, count(*)::int count FROM bookings GROUP BY status ORDER BY status',
      )
    ).rows,
  ).toEqual([
    { status: 'draft', count: 7 },
    { status: 'confirmed', count: 6 },
    { status: 'completed', count: 6 },
    { status: 'cancelled', count: 6 },
  ]);
  const rows = (
    await database.pool.query('SELECT * FROM bookings WHERE client_request_id <> $1', [
      '00000000-0000-4000-8000-000000000301',
    ])
  ).rows;
  expect(new Set(rows.map((row) => row.room_id).filter(Boolean)).size).toBe(3);
  for (const booking of rows) {
    expect(booking.owner_id).toBe(DEMO_CLIENT_ID);
    expect(booking.customer.fullName).toMatch(/^\[Demo\]/);
    expect(booking.created_at.getTime()).toBeLessThanOrEqual(now.getTime());
    if (booking.starts_at) {
      const start = DateTime.fromJSDate(booking.starts_at, { zone: 'America/Bogota' });
      expect(start.weekday).not.toBe(7);
      expect(
        DateTime.fromJSDate(booking.ends_at, { zone: 'America/Bogota' }).hour,
      ).toBeLessThanOrEqual(21);
    }
    if (booking.quote_snapshot) quoteSchema.parse(booking.quote_snapshot);
    if (booking.status !== 'draft') {
      const lines = (
        await database.pool.query('SELECT amount_cop FROM booking_lines WHERE booking_id=$1', [
          booking.id,
        ])
      ).rows;
      expect(lines).toHaveLength(4);
      expect(lines.reduce((sum, line) => sum + line.amount_cop, 0)).toBe(
        booking.quote_snapshot.breakdown.total,
      );
    }
  }
  expect(
    (await database.pool.query('SELECT count(*)::int count FROM email_outbox')).rows[0].count,
  ).toBe(18);
  expect(
    (await database.pool.query('SELECT count(*)::int count FROM captured_emails')).rows[0].count,
  ).toBe(0);
  const worker = new EmailWorker(database, undefined, () => now);
  for (let index = 0; index < 18; index++) expect((await worker.processOne()).status).toBe('sent');
  expect((await worker.processOne()).status).toBe('idle');
});

it('repetir el seed con otro reloj conserva ediciones, fechas, correos y contraseñas', async () => {
  await seedDemoBookings(database, now);
  await database.pool.query(
    'UPDATE bookings SET customer = customer || \'{"company":"Edición manual"}\'::jsonb, version=version+1 WHERE client_request_id=$1',
    [demoRequestId(0)],
  );
  const snapshot = async () =>
    (
      await database.pool.query(`SELECT
    (SELECT jsonb_agg(b ORDER BY id) FROM bookings b) bookings,
    (SELECT jsonb_agg(e ORDER BY id) FROM email_outbox e) emails,
    (SELECT jsonb_agg(u ORDER BY id) FROM users u) users`)
    ).rows;
  const before = await snapshot();
  expect(await seedDemoBookings(database, new Date('2026-12-31T17:00:00Z'))).toEqual({
    created: 0,
    existing: 24,
    skipped: 0,
  });
  expect(await snapshot()).toEqual(before);
});

it('dos arranques concurrentes crean los ejemplos una sola vez', async () => {
  const results = await Promise.all([
    seedDemoBookings(database, now),
    seedDemoBookings(database, now),
  ]);
  expect(results.map((result) => result.created).sort((a, b) => a - b)).toEqual([0, 24]);
  expect(
    (await database.pool.query('SELECT count(*)::int count FROM bookings')).rows[0].count,
  ).toBe(25);
  expect(
    (await database.pool.query('SELECT count(*)::int count FROM email_outbox')).rows[0].count,
  ).toBe(18);
});

it('respeta una reserva manual y busca otra hora para el ejemplo ocupado', async () => {
  const service = new BookingService(database, () => now);
  // Índice 9: confirmed, sala pequeña, once días después del viernes fijo.
  let manual = await service.create(DEMO_CLIENT_ID, {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    customer: { fullName: 'Reserva manual', email: 'manual@example.com' },
  });
  manual = await service.save(DEMO_CLIENT_ID, manual.id, {
    step: 2,
    expectedVersion: manual.version,
    roomId: DEMO_ROOM_ID,
    date: '2026-11-03',
    startTime: '09:00',
    durationMinutes: 60,
  });
  manual = await service.save(DEMO_CLIENT_ID, manual.id, {
    step: 3,
    expectedVersion: manual.version,
    serviceCodes: [],
  });
  manual = await service.confirm(DEMO_CLIENT_ID, manual.id, { expectedVersion: manual.version });
  expect(await seedDemoBookings(database, now)).toEqual({ created: 24, existing: 0, skipped: 0 });
  expect(await service.get(DEMO_CLIENT_ID, manual.id)).toEqual(manual);
  const [demo] = (
    await database.pool.query('SELECT starts_at FROM bookings WHERE client_request_id=$1', [
      demoRequestId(9),
    ])
  ).rows;
  expect(demo.starts_at.toISOString()).toBe('2026-11-03T15:00:00.000Z');
});

it('omite el ejemplo si no hay cupo y puede agregarlo después de liberar la sala', async () => {
  const service = new BookingService(database, () => now);
  for (const [index, startTime, durationMinutes] of [
    [1, '07:00', 600],
    [2, '17:00', 240],
  ] as const) {
    let booking = await service.create(DEMO_CLIENT_ID, {
      clientRequestId: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
      customer: { fullName: 'Sala ocupada manualmente', email: 'manual@example.com' },
    });
    booking = await service.save(DEMO_CLIENT_ID, booking.id, {
      step: 2,
      expectedVersion: booking.version,
      roomId: '00000000-0000-4000-8000-000000000202',
      date: '2026-10-26',
      startTime,
      durationMinutes,
    });
    booking = await service.save(DEMO_CLIENT_ID, booking.id, {
      step: 3,
      expectedVersion: booking.version,
      serviceCodes: [],
    });
    await service.confirm(DEMO_CLIENT_ID, booking.id, { expectedVersion: booking.version });
  }
  expect(await seedDemoBookings(database, now)).toEqual({ created: 23, existing: 0, skipped: 1 });
  expect(await seedDemoBookings(database, now)).toEqual({ created: 0, existing: 23, skipped: 1 });
  await database.pool.query(
    "UPDATE bookings SET status='cancelled', cancelled_at=$1, cancellation_reason='Cambio manual de fecha' WHERE customer->>'email'='manual@example.com'",
    [now],
  );
  expect(await seedDemoBookings(database, now)).toEqual({ created: 1, existing: 23, skipped: 0 });
});

it('un fallo SQL revierte el conjunto de ejemplos sin tocar el seed básico', async () => {
  await database.pool
    .query(`CREATE FUNCTION fail_demo_seed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.client_request_id = '${demoRequestId(5)}'::uuid THEN RAISE EXCEPTION 'fallo de fixture'; END IF;
    RETURN NEW; END $$; CREATE TRIGGER fail_demo_seed BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION fail_demo_seed();`);
  try {
    await expect(seedDemoBookings(database, now)).rejects.toThrow();
    expect(
      (await database.pool.query('SELECT count(*)::int count FROM bookings')).rows[0].count,
    ).toBe(1);
    expect(
      (await database.pool.query('SELECT count(*)::int count FROM email_outbox')).rows[0].count,
    ).toBe(0);
  } finally {
    await database.pool.query(
      'DROP TRIGGER fail_demo_seed ON bookings; DROP FUNCTION fail_demo_seed()',
    );
  }
});
