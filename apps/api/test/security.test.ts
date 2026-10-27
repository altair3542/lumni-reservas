import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createSessions, SESSION_COOKIE } from '../src/auth/session.js';
import { BookingService } from '../src/bookings/service.js';
import { DEMO_ADMIN_ID, DEMO_CLIENT_ID, DEMO_ROOM_ID } from '../src/db/seed.js';
import { demoPasswords, openTestDatabase, prepareDatabase, resetDatabase } from './helpers.js';

const database = openTestDatabase();
const origin = 'http://localhost:5173';
const config = readConfig({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  NODE_ENV: 'test',
  WEB_ORIGIN: origin,
});
let clock = new Date('2026-10-27T12:00:00Z');
const now = () => clock;
const logError = vi.fn();
const extract = vi.fn(async () => ({ intent: 'unrelated' as const, patch: {}, evidence: {} }));
let app = createApp({ database, config, now, llm: { extract }, logError });
let cookie: string, adminCookie: string;
const post = (path: string, body: object, session = cookie) =>
  request(app).post(`/api${path}`).set('Origin', origin).set('Cookie', session).send(body);
const customer = { fullName: 'Cliente de prueba', email: 'cliente@example.com' };
const bookings = new BookingService(database, now);

beforeAll(() => prepareDatabase(database));
beforeEach(async () => {
  clock = new Date('2026-10-27T12:00:00Z');
  logError.mockClear();
  extract.mockClear();
  await resetDatabase(database);
  app = createApp({ database, config, now, llm: { extract }, logError });
  const sessions = createSessions(database, config, now);
  cookie = `${SESSION_COOKIE}=${await sessions.issue(DEMO_CLIENT_ID)}`;
  adminCookie = `${SESSION_COOKIE}=${await sessions.issue(DEMO_ADMIN_ID)}`;
});
afterAll(() => database.pool.end());

describe('Fronteras HTTP con PostgreSQL real', () => {
  it.each(['\0', '\ud800', '\udfff'])(
    'texto inválido %j devuelve 400 sin mutar borrador, confirmación o chat',
    async (invalid) => {
      const count = async () =>
        (await database.pool.query('SELECT count(*)::int n FROM bookings')).rows[0].n;
      const before = await count();
      for (const input of [{ fullName: `Nombre${invalid}` }, { company: `Equipo${invalid}` }]) {
        const response = await post('/bookings', {
          clientRequestId: randomUUID(),
          customer: input,
        }).expect(400);
        expect(response.body.error.code).toBe('INVALID_INPUT');
      }
      expect(await count()).toBe(before);
      let booking = await bookings.create(DEMO_CLIENT_ID, {
        clientRequestId: randomUUID(),
        customer,
      });
      await request(app)
        .patch(`/api/bookings/${booking.id}/draft`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send({
          step: 1,
          expectedVersion: booking.version,
          customer: { ...customer, fullName: `Nombre${invalid}` },
        })
        .expect(400);
      expect(await bookings.get(DEMO_CLIENT_ID, booking.id)).toEqual(booking);
      booking = await bookings.save(DEMO_CLIENT_ID, booking.id, {
        step: 2,
        expectedVersion: booking.version,
        roomId: DEMO_ROOM_ID,
        date: '2026-10-28',
        startTime: '09:00',
        durationMinutes: 60,
      });
      booking = await bookings.save(DEMO_CLIENT_ID, booking.id, {
        step: 3,
        expectedVersion: booking.version,
        serviceCodes: [],
      });
      booking = await bookings.confirm(DEMO_CLIENT_ID, booking.id, {
        expectedVersion: booking.version,
      });
      await post(
        `/admin/bookings/${booking.id}/cancel`,
        { expectedVersion: booking.version, reason: `Cambio${invalid}` },
        adminCookie,
      ).expect(400);
      expect(await bookings.get(DEMO_CLIENT_ID, booking.id)).toEqual(booking);
      const conversation = (
        await post('/chat/conversations', { clientRequestId: randomUUID() }).expect(200)
      ).body.conversation;
      await post(`/chat/conversations/${conversation.id}/messages`, {
        kind: 'message',
        clientMessageId: randomUUID(),
        expectedVersion: conversation.version,
        content: `Sala${invalid}`,
      }).expect(400);
      expect(extract).not.toHaveBeenCalled();
      const reloaded = await request(app)
        .get(`/api/chat/conversations/${conversation.id}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(reloaded.body.conversation).toEqual(conversation);
      expect(logError).not.toHaveBeenCalled();
      await request(app).get('/api/health').expect(200);
    },
  );

  it('guarda y recarga contactos Unicode y mensajes con emojis y varias líneas', async () => {
    const contact = { fullName: 'José 👨‍👩‍👧', email: 'jose@example.com', company: '团队' };
    const booking = (
      await post('/bookings', { clientRequestId: randomUUID(), customer: contact }).expect(200)
    ).body.booking;
    expect((await bookings.get(DEMO_CLIENT_ID, booking.id)).customer).toEqual(contact);
    const conversation = (
      await post('/chat/conversations', { clientRequestId: randomUUID() }).expect(200)
    ).body.conversation;
    const content = 'Hola 👋\nGracias por ayudarme\tcon mi reunión';
    const response = await post(`/chat/conversations/${conversation.id}/messages`, {
      kind: 'message',
      clientMessageId: randomUUID(),
      expectedVersion: conversation.version,
      content,
    }).expect(200);
    expect(response.body.conversation.messages[0].content).toBe(content);
    const reloaded = await request(app)
      .get(`/api/chat/conversations/${conversation.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(reloaded.body.conversation.messages[0].content).toBe(content);
    expect(extract).toHaveBeenCalledOnce();
  });

  it('limita antes de consultar usuarios o ejecutar scrypt y permite volver a entrar tras un minuto', async () => {
    const select = vi.spyOn(database.db, 'select');
    try {
      const responses = await Promise.all(
        Array.from({ length: 31 }, (_, i) =>
          request(app)
            .post('/api/auth/login')
            .set('Origin', origin)
            .set('X-Forwarded-For', `192.0.2.${i + 1}`)
            .send({ email: 'cliente@example.com', password: 'incorrecta' }),
        ),
      );
      expect(responses.filter((r) => r.status === 401)).toHaveLength(30);
      expect(responses.filter((r) => r.status === 429)).toHaveLength(1);
      expect(select).toHaveBeenCalledTimes(30);
      const body = { email: 'cliente@example.com', password: demoPasswords.clientPassword };
      const blocked = await post('/auth/login', body).expect(429);
      expect(blocked.body.error.code).toBe('LOGIN_RATE_LIMIT');
      expect(blocked.body.error.requestId).toBe(blocked.headers['x-request-id']);
      expect(blocked.headers['retry-after']).toBe('60');
      expect(blocked.headers['set-cookie']).toBeUndefined();
      expect(select).toHaveBeenCalledTimes(30);
      await request(app).get('/api/health').expect(200);
      clock = new Date(clock.getTime() + 60000);
      const login = await post('/auth/login', body).expect(200);
      expect(login.body.user.role).toBe('client');
      const session = login.headers['set-cookie']![0]!.split(';')[0]!;
      await request(app).get('/api/me').set('Cookie', session).expect(200);
    } finally {
      select.mockRestore();
    }
  });
});
