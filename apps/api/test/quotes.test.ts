import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { quoteSchema } from '@lumni/shared';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { DEMO_CLIENT_ID, DEMO_ROOM_ID } from '../src/db/seed.js';
import { QuoteService } from '../src/quotes/service.js';
import { hashPassword } from '../src/auth/password.js';
import { demoPasswords, openTestDatabase, prepareDatabase, resetDatabase } from './helpers.js';
const database = openTestDatabase();
const origin = 'http://localhost:5173';
const now = () => new Date('2026-10-23T17:00:00Z');
const config = readConfig({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  WEB_ORIGIN: origin,
  NODE_ENV: 'test',
});
const app = createApp({ database, config, now });
const input = {
  roomId: DEMO_ROOM_ID,
  date: '2026-10-26',
  startTime: '09:00',
  durationMinutes: 60,
  serviceCodes: [],
};
const agent = () => request.agent(app);
async function client() {
  const result = agent();
  await result
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'cliente@example.com', password: demoPasswords.clientPassword })
    .expect(200);
  return result;
}
async function occupy({
  start = '09:00',
  end = '10:30',
  status = 'confirmed',
  roomId = DEMO_ROOM_ID,
  ownerId = DEMO_CLIENT_ID,
}: {
  start?: string;
  end?: string;
  status?: 'confirmed' | 'completed' | 'draft' | 'cancelled';
  roomId?: string;
  ownerId?: string;
} = {}) {
  const startsAt = `2026-10-26T${start}:00-05:00`,
    endsAt = `2026-10-26T${end}:00-05:00`;
  const base = ((Date.parse(endsAt) - Date.parse(startsAt)) / 3600000) * 40000;
  const snapshot = {
    roomId,
    startsAt,
    endsAt,
    timeZone: 'America/Bogota',
    currency: 'COP',
    pricingVersion: 'v1',
    breakdown: { base, discount: 0, surcharge: 0, services: 0, total: base },
    canBook: true,
    reasonCode: null,
    message: null,
    suggestedSlot: null,
  };
  await database.pool.query(
    `INSERT INTO bookings (owner_id,client_request_id,create_request_hash,status,customer,room_id,starts_at,ends_at,service_codes,quote_snapshot,confirmed_at,cancelled_at,cancellation_reason)
    VALUES ($1,$2,'quote-fixture',$3,$4,$5,$6,$7,'[]',$8,$9,$10,$11)`,
    [
      ownerId,
      randomUUID(),
      status,
      JSON.stringify({ fullName: 'Cliente fixture', email: 'fixture@example.com' }),
      roomId,
      startsAt,
      endsAt,
      JSON.stringify(snapshot),
      status === 'draft' ? null : now(),
      status === 'cancelled' ? now() : null,
      status === 'cancelled' ? 'Cancelada para prueba' : null,
    ],
  );
}
beforeAll(() => prepareDatabase(database));
beforeEach(() => resetDatabase(database));
afterAll(() => database.pool.end());

describe('POST /api/quotes con sesión y PostgreSQL real', () => {
  it('exige sesión de cliente y rechaza administrador', async () => {
    await request(app).post('/api/quotes').set('Origin', origin).send(input).expect(401);
    const admin = agent();
    await admin
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@example.com', password: demoPasswords.adminPassword })
      .expect(200);
    await admin.post('/api/quotes').set('Origin', origin).send(input).expect(403);
  });
  it('devuelve Quote v1 y el desglose de sábado con ambos extras desde el catálogo', async () => {
    const session = await client();
    const response = await session
      .post('/api/quotes')
      .set('Origin', origin)
      .send({
        ...input,
        date: '2026-10-24',
        durationMinutes: 240,
        serviceCodes: ['projector', 'coffee'],
      })
      .expect(200);
    expect(quoteSchema.parse(response.body)).toMatchObject({
      canBook: true,
      startsAt: '2026-10-24T09:00:00-05:00',
      endsAt: '2026-10-24T13:00:00-05:00',
      breakdown: {
        base: 160000,
        discount: 16000,
        surcharge: 36000,
        services: 30000,
        total: 210000,
      },
      suggestedSlot: null,
    });
  });
  it('servicio de cotización obtiene las tarifas actuales sin duplicar lógica', async () => {
    await database.pool.query('UPDATE rooms SET hourly_rate_cop=50000 WHERE id=$1', [DEMO_ROOM_ID]);
    await database.pool.query("UPDATE services SET flat_price_cop=17000 WHERE code='coffee'");
    const result = await new QuoteService(database, now).quote({
      ...input,
      serviceCodes: ['coffee'],
    });
    expect(result.breakdown).toEqual({
      base: 50000,
      discount: 0,
      surcharge: 0,
      services: 17000,
      total: 67000,
    });
  });
  it.each(['confirmed', 'completed'] as const)(
    'bloquea %s y encuentra alternativa después de toda la cadena',
    async (status) => {
      await occupy({ status });
      await occupy({ start: '10:30', end: '12:00' });
      const response = await (await client())
        .post('/api/quotes')
        .set('Origin', origin)
        .send(input)
        .expect(200);
      expect(quoteSchema.parse(response.body)).toMatchObject({
        canBook: false,
        reasonCode: 'ROOM_UNAVAILABLE',
        suggestedSlot: {
          startsAt: '2026-10-26T12:00:00-05:00',
          endsAt: '2026-10-26T13:00:00-05:00',
        },
      });
    },
  );
  it('una reserva de otro cliente también ocupa, sin exponer su información', async () => {
    const ownerId = randomUUID();
    await database.pool.query(
      "INSERT INTO users (id,email,password_hash,role,full_name) VALUES ($1,'otro@example.com',$2,'client','Otro Cliente')",
      [ownerId, await hashPassword('OtroClienteDemo2026!')],
    );
    await occupy({ ownerId });
    const response = await (await client())
      .post('/api/quotes')
      .set('Origin', origin)
      .send(input)
      .expect(200);
    expect(response.body.canBook).toBe(false);
    expect(JSON.stringify(response.body)).not.toMatch(/otro@example.com|Otro Cliente/);
  });
  it.each(['draft', 'cancelled'] as const)('%s no ocupa; otras salas tampoco', async (status) => {
    await occupy({ status });
    await occupy({ roomId: '00000000-0000-4000-8000-000000000202' });
    const response = await (await client())
      .post('/api/quotes')
      .set('Origin', origin)
      .send(input)
      .expect(200);
    expect(response.body.canBook).toBe(true);
  });
  it('permite terminar al inicio de otra reserva y empezar cuando termina', async () => {
    await occupy();
    const session = await client();
    for (const startTime of ['08:00', '10:30']) {
      const response = await session
        .post('/api/quotes')
        .set('Origin', origin)
        .send({ ...input, startTime })
        .expect(200);
      expect(response.body.canBook).toBe(true);
    }
  });
  it('no ofrece alternativa mañana ni una duración inferior a la pedida', async () => {
    await occupy({ start: '07:00', end: '08:00' });
    await occupy({ start: '16:00', end: '17:00' });
    const response = await (
      await client()
    )
      .post('/api/quotes')
      .set('Origin', origin)
      .send({ ...input, startTime: '07:00', durationMinutes: 600 })
      .expect(200);
    expect(response.body).toMatchObject({ canBook: false, suggestedSlot: null });
  });
  it('rechaza datos manipulados, IDs desconocidos, fechas imposibles y duraciones fuera de contrato', async () => {
    const session = await client();
    for (const patch of [
      { total: 1 },
      { hourlyRateCop: 1 },
      { ownerId: DEMO_CLIENT_ID },
      { date: '2026-02-30' },
      { durationMinutes: '60' },
      { durationMinutes: 601 },
      { startTime: '09:15' },
      { serviceCodes: ['invented'] },
    ])
      await session
        .post('/api/quotes')
        .set('Origin', origin)
        .send({ ...input, ...patch })
        .expect(400);
    await session
      .post('/api/quotes')
      .set('Origin', origin)
      .send({ ...input, roomId: randomUUID() })
      .expect(404);
    await database.pool.query("DELETE FROM services WHERE code='projector'");
    await session
      .post('/api/quotes')
      .set('Origin', origin)
      .send({ ...input, serviceCodes: ['projector'] })
      .expect(422);
  });
  it('domingos, pasado y cierre responden 200 con motivo y no con errores de formato', async () => {
    const session = await client();
    for (const patch of [{ date: '2026-10-25' }, { date: '2026-10-22' }, { startTime: '20:30' }]) {
      const response = await session
        .post('/api/quotes')
        .set('Origin', origin)
        .send({ ...input, ...patch })
        .expect(200);
      expect(quoteSchema.parse(response.body)).toMatchObject({
        canBook: false,
        suggestedSlot: null,
      });
      expect(response.body.message).toBeTruthy();
    }
  });
  it('cotizar simultáneamente no crea reservas, líneas ni eventos y no bloquea cupo', async () => {
    const session = await client();
    const count = async () =>
      (
        await database.pool.query(
          'SELECT (SELECT count(*)::int FROM bookings) bookings, (SELECT count(*)::int FROM booking_lines) lines, (SELECT count(*)::int FROM email_outbox) emails',
        )
      ).rows[0];
    const before = await count();
    const responses = await Promise.all([
      session.post('/api/quotes').set('Origin', origin).send(input),
      session.post('/api/quotes').set('Origin', origin).send(input),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses.map((r) => r.body.canBook)).toEqual([true, true]);
    expect(await count()).toEqual(before);
  });
});
