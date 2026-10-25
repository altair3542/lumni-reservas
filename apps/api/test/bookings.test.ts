import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  bookingListSchema,
  bookingResponseSchema,
  errorResponseSchema,
  type Booking,
} from '@lumni/shared';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createSessions } from '../src/auth/session.js';
import { DEMO_CLIENT_ID, DEMO_ROOM_ID } from '../src/db/seed.js';
import { openTestDatabase, prepareDatabase, resetDatabase } from './helpers.js';

const database = openTestDatabase();
const origin = 'http://localhost:5173';
let clock = new Date('2026-10-23T17:00:00Z');
const now = () => clock;
const config = readConfig({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  WEB_ORIGIN: origin,
  NODE_ENV: 'test',
});
const app = createApp({ database, config, now, logError: () => {} });
const secondOwner = '00000000-0000-4000-8000-000000000999';
let cookie: string;
let otherCookie: string;
let adminCookie: string;
const customer = { fullName: 'Ana Pérez', email: 'ana@example.com', company: 'Empresa demo' };
const schedule = {
  roomId: DEMO_ROOM_ID,
  date: '2026-10-26',
  startTime: '09:00',
  durationMinutes: 240,
};

const decode = (response: { body: unknown }): Booking =>
  bookingResponseSchema.parse(response.body).booking;
function post(path: string, body: object, session = cookie) {
  return request(app).post(path).set('Origin', origin).set('Cookie', session).send(body);
}
function patch(id: string, body: object, session = cookie) {
  return request(app)
    .patch(`/api/bookings/${id}/draft`)
    .set('Origin', origin)
    .set('Cookie', session)
    .send(body);
}
const confirm = (booking: Booking, session = cookie) =>
  post(`/api/bookings/${booking.id}/confirm`, { expectedVersion: booking.version }, session);
async function create(session = cookie, input: Record<string, unknown> = {}) {
  return decode(
    await post('/api/bookings', { clientRequestId: randomUUID(), ...input }, session).expect(200),
  );
}
async function ready(session = cookie, slot: Partial<typeof schedule> = {}, codes: string[] = []) {
  let booking = await create(session, { customer });
  booking = decode(
    await patch(
      booking.id,
      { step: 2, expectedVersion: booking.version, ...schedule, ...slot },
      session,
    ).expect(200),
  );
  return decode(
    await patch(
      booking.id,
      { step: 3, expectedVersion: booking.version, serviceCodes: codes },
      session,
    ).expect(200),
  );
}
async function counts(id?: string) {
  const filter = id ? ' WHERE booking_id=$1' : '';
  const params = id ? [id] : [];
  const lines = await database.pool.query(
    `SELECT count(*)::int count, coalesce(sum(amount_cop),0)::int total FROM booking_lines${filter}`,
    params,
  );
  const events = await database.pool.query(
    `SELECT count(*)::int count FROM email_outbox${filter}`,
    params,
  );
  return { lines: lines.rows[0].count, total: lines.rows[0].total, events: events.rows[0].count };
}

beforeAll(() => prepareDatabase(database));
beforeEach(async () => {
  clock = new Date('2026-10-23T17:00:00Z');
  await resetDatabase(database);
  await database.pool.query(
    "INSERT INTO users (id,email,password_hash,role,full_name) VALUES ($1,'segundo@example.com','test','client','Segundo Cliente')",
    [secondOwner],
  );
  const sessions = createSessions(database, config, now);
  cookie = `lumni_session=${await sessions.issue(DEMO_CLIENT_ID)}`;
  otherCookie = `lumni_session=${await sessions.issue(secondOwner)}`;
  const admin = await database.pool.query("SELECT id FROM users WHERE role='admin'");
  adminCookie = `lumni_session=${await sessions.issue(admin.rows[0].id)}`;
});
afterAll(() => database.pool.end());

describe('Reservas HTTP y PostgreSQL real', () => {
  it('crea sin sala/precio, rechaza confirmación incompleta y retoma en una sesión nueva', async () => {
    let booking = await create(cookie, { customer: { fullName: 'Ana' } });
    expect(booking).toMatchObject({
      status: 'draft',
      wizardStep: 1,
      version: 1,
      roomId: null,
      quoteSnapshot: null,
      serviceCodes: null,
    });
    await confirm(booking).expect(422);
    booking = decode(
      await patch(booking.id, { step: 1, expectedVersion: 1, customer }).expect(200),
    );
    expect(booking).toMatchObject({ version: 2, wizardStep: 2, customer });
    const newCookie = `lumni_session=${await createSessions(database, config, now).issue(DEMO_CLIENT_ID)}`;
    const freshApp = createApp({ database, config, now });
    const resumed = decode(
      await request(freshApp)
        .get(`/api/bookings/${booking.id}`)
        .set('Cookie', newCookie)
        .expect(200),
    );
    expect(resumed).toEqual(booking);
    const list = bookingListSchema.parse(
      (
        await request(freshApp)
          .get('/api/bookings?status=draft')
          .set('Cookie', newCookie)
          .expect(200)
      ).body,
    );
    expect(list.items).toContainEqual(booking);
    expect(list.items.every((item) => item.ownerId === DEMO_CLIENT_ID)).toBe(true);
  });
  it('creación concurrente idempotente, hash original estable tras editar, replay incompatible 409', async () => {
    const clientRequestId = randomUUID();
    const body = { clientRequestId, customer: { email: ' ANA@EXAMPLE.COM ', fullName: 'Ana' } };
    const results = await Promise.all([post('/api/bookings', body), post('/api/bookings', body)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const first = decode(results[0]);
    expect(decode(results[1]).id).toBe(first.id);
    await patch(first.id, { step: 1, expectedVersion: first.version, customer }).expect(200);
    const replay = decode(
      await post('/api/bookings', {
        customer: { fullName: 'Ana', email: 'ana@example.com' },
        clientRequestId,
      }).expect(200),
    );
    expect(replay).toMatchObject({ id: first.id, version: 2, customer });
    await post('/api/bookings', { ...body, customer: { fullName: 'Otra' } }).expect(409);
    const other = await create(otherCookie, { clientRequestId, customer });
    expect(other.id).not.toBe(first.id);
  });
  it('pasos y extras explícitos, precio de servidor, edición invalida el snapshot y obliga revisión', async () => {
    let booking = await create(cookie, { customer });
    await patch(booking.id, { step: 3, expectedVersion: booking.version, serviceCodes: [] }).expect(
      422,
    );
    booking = decode(
      await patch(booking.id, { step: 2, expectedVersion: booking.version, ...schedule }).expect(
        200,
      ),
    );
    expect(booking).toMatchObject({ wizardStep: 3, version: 2, quoteSnapshot: null });
    await confirm(booking).expect(422);
    await patch(booking.id, { step: 3, expectedVersion: booking.version }).expect(400);
    booking = decode(
      await patch(booking.id, {
        step: 3,
        expectedVersion: booking.version,
        serviceCodes: ['projector', 'coffee'],
      }).expect(200),
    );
    expect(booking.quoteSnapshot?.breakdown.total).toBe(174000);
    booking = decode(
      await patch(booking.id, {
        step: 2,
        expectedVersion: booking.version,
        ...schedule,
        durationMinutes: 60,
      }).expect(200),
    );
    expect(booking.quoteSnapshot).toBeNull();
    await confirm(booking).expect(422);
    booking = decode(
      await patch(booking.id, {
        step: 3,
        expectedVersion: booking.version,
        serviceCodes: [],
      }).expect(200),
    );
    expect(booking.quoteSnapshot?.breakdown.total).toBe(40000);
    expect(booking.serviceCodes).toEqual([]);
  });
  it('retoma los tres pasos y el snapshot desde otra instancia y sesión sin almacenamiento del navegador', async () => {
    const draft = await ready(cookie, {}, ['projector', 'coffee']);
    const freshApp = createApp({ database, config, now });
    const session = `lumni_session=${await createSessions(database, config, now).issue(DEMO_CLIENT_ID)}`;
    const loaded = decode(
      await request(freshApp).get(`/api/bookings/${draft.id}`).set('Cookie', session).expect(200),
    );
    expect(loaded).toEqual(draft);
    expect(loaded).toMatchObject({
      customer,
      roomId: schedule.roomId,
      serviceCodes: ['projector', 'coffee'],
      wizardStep: 3,
    });
    expect(loaded.quoteSnapshot?.breakdown.total).toBe(174000);
  });
  it('puede prellenar sala/horario antes del contacto, pero exige completar contacto antes de extras', async () => {
    let draft = await create();
    draft = decode(
      await patch(draft.id, { step: 2, expectedVersion: draft.version, ...schedule }).expect(200),
    );
    expect(draft.wizardStep).toBe(1);
    await patch(draft.id, { step: 3, expectedVersion: draft.version, serviceCodes: [] }).expect(
      422,
    );
    draft = decode(
      await patch(draft.id, { step: 1, expectedVersion: draft.version, customer }).expect(200),
    );
    expect(draft.wizardStep).toBe(3);
    await patch(draft.id, { step: 3, expectedVersion: draft.version, serviceCodes: [] }).expect(
      200,
    );
  });
  it('dos PATCH con la misma versión: uno gana y otro recibe 409 sin pisar datos', async () => {
    const booking = await create();
    const results = await Promise.all([
      patch(booking.id, { step: 1, expectedVersion: 1, customer }),
      patch(booking.id, {
        step: 1,
        expectedVersion: 1,
        customer: { ...customer, fullName: 'Otra persona' },
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const saved = decode(
      await request(app).get(`/api/bookings/${booking.id}`).set('Cookie', cookie).expect(200),
    );
    expect(saved).toEqual(decode(results.find((r) => r.status === 200)!));
    expect(saved.version).toBe(2);
  });
  it.each([1, 2, 3])(
    'carrera de dos clientes %i: un confirmed, un 409 con alternativa tras rollback y un outbox',
    async () => {
      const first = await ready(cookie);
      const second = await ready(otherCookie);
      expect(first.quoteSnapshot?.canBook).toBe(true);
      expect(second.quoteSnapshot?.canBook).toBe(true);
      // Barrera explícita de salida; cada request resuelve sesión y obtiene su propia conexión PG.
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const launch = async (draft: Booking, session: string) => {
        await barrier;
        return confirm(draft, session);
      };
      const pending = [launch(first, cookie), launch(second, otherCookie)];
      release();
      const results = await Promise.all(pending);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const error = errorResponseSchema.parse(results.find((r) => r.status === 409)!.body).error;
      expect(error).toMatchObject({
        code: 'ROOM_UNAVAILABLE',
        suggestedSlot: {
          startsAt: '2026-10-26T13:00:00-05:00',
          endsAt: '2026-10-26T17:00:00-05:00',
        },
      });
      const rows = (
        await database.pool.query('SELECT status FROM bookings WHERE id=ANY($1::uuid[])', [
          [first.id, second.id],
        ])
      ).rows;
      expect(rows.map((r) => r.status).sort()).toEqual(['confirmed', 'draft']);
      expect(await counts()).toMatchObject({ events: 1, lines: 4, total: 144000 });
    },
  );
  it.each(['contiguas', 'otra sala'])(
    'confirmaciones simultáneas %s: ambas pasan',
    async (kind) => {
      const first = await ready();
      const second = await ready(
        otherCookie,
        kind === 'contiguas'
          ? { startTime: '13:00' }
          : { roomId: '00000000-0000-4000-8000-000000000202' },
      );
      const results = await Promise.all([confirm(first), confirm(second, otherCookie)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect((await counts()).events).toBe(2);
    },
  );
  it('misma reserva en paralelo y replay con versión vieja: mismo snapshot, fecha, líneas y correo', async () => {
    const draft = await ready(cookie, {}, ['coffee']);
    // El precio se pacta en paso 3, incluso si el catálogo cambia antes del primer confirm.
    await database.pool.query('UPDATE rooms SET hourly_rate_cop=99000 WHERE id=$1', [DEMO_ROOM_ID]);
    await database.pool.query("UPDATE services SET flat_price_cop=1 WHERE code='coffee'");
    const results = await Promise.all([confirm(draft), confirm(draft)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const confirmed = decode(results[0]);
    expect(decode(results[1])).toEqual(confirmed);
    expect(confirmed.quoteSnapshot).toEqual(draft.quoteSnapshot);
    expect(confirmed.version).toBe(draft.version + 1);
    const before = await database.pool.query(
      'SELECT payload FROM email_outbox WHERE booking_id=$1',
      [draft.id],
    );
    expect(before.rows[0].payload).toMatchObject({ toEmail: customer.email });
    expect(before.rows[0].payload.textBody).toContain('154000 COP');
    await database.pool.query('UPDATE rooms SET hourly_rate_cop=123456 WHERE id=$1', [
      DEMO_ROOM_ID,
    ]);
    clock = new Date('2026-10-27T17:00:00Z');
    // La sesión sigue válida para poder probar replay posterior al horario sin cambiar reloj de auth.
    const renewed = `lumni_session=${await createSessions(database, config, now).issue(DEMO_CLIENT_ID)}`;
    const replay = decode(await confirm(draft, renewed).expect(200));
    expect(replay).toEqual(confirmed);
    expect(await counts(draft.id)).toEqual({ lines: 4, total: 154000, events: 1 });
    expect(
      (
        await database.pool.query('SELECT payload FROM email_outbox WHERE booking_id=$1', [
          draft.id,
        ])
      ).rows,
    ).toEqual(before.rows);
    await patch(
      draft.id,
      { step: 1, expectedVersion: confirmed.version, customer },
      renewed,
    ).expect(409);
  });
  it('un servicio retirado después del snapshot no impide confirmar ni responder al conflicto de horario', async () => {
    const first = await ready(cookie, {}, ['coffee']);
    const second = await ready(otherCookie, {}, ['coffee']);
    await database.pool.query("DELETE FROM services WHERE code='coffee'");
    const confirmed = decode(await confirm(first).expect(200));
    expect(confirmed.quoteSnapshot).toEqual(first.quoteSnapshot);
    const response = await confirm(second, otherCookie).expect(409);
    expect(errorResponseSchema.parse(response.body).error).toMatchObject({
      code: 'ROOM_UNAVAILABLE',
      suggestedSlot: { startsAt: '2026-10-26T13:00:00-05:00', endsAt: '2026-10-26T17:00:00-05:00' },
    });
    expect((await counts()).events).toBe(1);
  });
  it('versión obsoleta en draft no confirma; una confirmación válida queda pending y sin captura', async () => {
    const draft = await ready();
    await post(`/api/bookings/${draft.id}/confirm`, { expectedVersion: 1 }).expect(409);
    expect(await counts(draft.id)).toEqual({ lines: 0, total: 0, events: 0 });
    await confirm(draft).expect(200);
    expect(
      (
        await database.pool.query(
          'SELECT status,attempts,dedup_key FROM email_outbox WHERE booking_id=$1',
          [draft.id],
        )
      ).rows[0],
    ).toEqual({ status: 'pending', attempts: 0, dedup_key: `booking-confirmed:${draft.id}` });
    expect(
      (await database.pool.query('SELECT count(*)::int count FROM captured_emails')).rows[0].count,
    ).toBe(0);
  });
  it('fallo real insertando outbox revierte estado y líneas; reintento posterior confirma', async () => {
    const draft = await ready();
    // Trigger exclusivamente en la base aislada de tests, sin puertas de fallo en producción.
    await database.pool.query(
      "CREATE FUNCTION test_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test outbox failure'; END $$",
    );
    await database.pool.query(
      'CREATE TRIGGER test_reject_outbox BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION test_reject_outbox()',
    );
    try {
      await confirm(draft).expect(500);
      expect(
        decode(
          await request(app).get(`/api/bookings/${draft.id}`).set('Cookie', cookie).expect(200),
        ),
      ).toEqual(draft);
      expect(await counts(draft.id)).toEqual({ lines: 0, total: 0, events: 0 });
    } finally {
      await database.pool.query('DROP TRIGGER test_reject_outbox ON email_outbox');
      await database.pool.query('DROP FUNCTION test_reject_outbox()');
    }
    await confirm(draft).expect(200);
    expect((await counts(draft.id)).events).toBe(1);
  });
  it.each(['cancelled', 'completed'])(
    'estado final %s rechaza reconfirmación y edición',
    async (status) => {
      const draft = await ready();
      const confirmed = decode(await confirm(draft).expect(200));
      await database.pool.query(
        "UPDATE bookings SET status=$2::booking_status,cancelled_at=CASE WHEN $2::booking_status='cancelled' THEN now() ELSE NULL END,cancellation_reason=CASE WHEN $2::booking_status='cancelled' THEN 'Cambio' ELSE NULL END WHERE id=$1",
        [draft.id, status],
      );
      await confirm(confirmed).expect(409);
      await patch(draft.id, { step: 1, expectedVersion: confirmed.version, customer }).expect(409);
      expect((await counts(draft.id)).events).toBe(1);
    },
  );
  it('rechaza reservas ajenas como 404 en lectura, edición y confirmación, y filtra listado', async () => {
    const draft = await ready(otherCookie);
    await request(app).get(`/api/bookings/${draft.id}`).set('Cookie', cookie).expect(404);
    await patch(draft.id, { step: 1, expectedVersion: draft.version, customer }).expect(404);
    await confirm(draft).expect(404);
    const list = bookingListSchema.parse(
      (await request(app).get('/api/bookings').set('Cookie', cookie).expect(200)).body,
    );
    expect(list.items.some((item) => item.id === draft.id)).toBe(false);
  });
  it('sesión, rol, Origin y contratos estrictos protegen todos los endpoints', async () => {
    const draft = await create();
    for (const session of ['', adminCookie]) {
      const status = session ? 403 : 401;
      await post('/api/bookings', { clientRequestId: randomUUID() }, session).expect(status);
      await request(app).get('/api/bookings').set('Cookie', session).expect(status);
      await request(app).get(`/api/bookings/${draft.id}`).set('Cookie', session).expect(status);
      await patch(draft.id, { step: 1, expectedVersion: draft.version, customer }, session).expect(
        status,
      );
      await confirm(draft, session).expect(status);
    }
    await request(app)
      .post('/api/bookings')
      .set('Cookie', cookie)
      .send({ clientRequestId: randomUUID() })
      .expect(403);
    for (const extra of [
      { ownerId: secondOwner },
      { status: 'confirmed' },
      { total: 1 },
      { role: 'admin' },
    ]) {
      await post('/api/bookings', { clientRequestId: randomUUID(), ...extra }).expect(400);
      await patch(draft.id, { step: 1, expectedVersion: 1, customer, ...extra }).expect(400);
      await post(`/api/bookings/${draft.id}/confirm`, { expectedVersion: 1, ...extra }).expect(400);
    }
    await request(app).get('/api/bookings?ownerId=arbitrary').set('Cookie', cookie).expect(400);
    await request(app).get('/api/bookings?status=wrong').set('Cookie', cookie).expect(400);
    await request(app).get('/api/bookings/not-a-uuid').set('Cookie', cookie).expect(400);
    await request(app).get(`/api/bookings/${randomUUID()}`).set('Cookie', cookie).expect(404);
  });
  it('horarios inválidos, sala desconocida y servicios retirados no alteran el borrador', async () => {
    const draft = await create(cookie, { customer });
    for (const slot of [
      { date: '2026-10-25' },
      { date: '2026-10-22' },
      { startTime: '06:30' },
      { startTime: '20:30', durationMinutes: 60 },
    ])
      await patch(draft.id, {
        step: 2,
        expectedVersion: draft.version,
        ...schedule,
        ...slot,
      }).expect(422);
    await patch(draft.id, {
      step: 2,
      expectedVersion: draft.version,
      ...schedule,
      roomId: randomUUID(),
    }).expect(404);
    const scheduled = decode(
      await patch(draft.id, { step: 2, expectedVersion: draft.version, ...schedule }).expect(200),
    );
    await database.pool.query("DELETE FROM services WHERE code='coffee'");
    await patch(draft.id, {
      step: 3,
      expectedVersion: scheduled.version,
      serviceCodes: ['coffee'],
    }).expect(422);
    expect(
      decode(await request(app).get(`/api/bookings/${draft.id}`).set('Cookie', cookie).expect(200)),
    ).toEqual(scheduled);
  });
  it('revalida el reloj al confirmar sin recalcular el precio guardado', async () => {
    const draft = await ready();
    clock = new Date('2026-10-26T15:00:00Z');
    const renewed = `lumni_session=${await createSessions(database, config, now).issue(DEMO_CLIENT_ID)}`;
    const response = await confirm(draft, renewed).expect(422);
    expect(response.body.error.code).toBe('PAST');
    expect(await counts(draft.id)).toEqual({ lines: 0, total: 0, events: 0 });
  });
  it('catálogo PostgreSQL conserva exclusión parcial GiST con rangos semiabiertos', async () => {
    const row = (
      await database.pool.query(
        "SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='bookings_no_overlap'",
      )
    ).rows[0];
    expect(row.definition).toContain('EXCLUDE USING gist');
    expect(row.definition).toContain("'[)'::text");
    expect(row.definition).toContain('confirmed');
    expect(row.definition).toContain('completed');
  });
});
