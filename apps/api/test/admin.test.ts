import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  adminBookingDetailSchema,
  adminBookingPageSchema,
  bookingResponseSchema,
  emailDetailSchema,
  emailQueuePageSchema,
  type Booking,
} from '@lumni/shared';
import { createApp } from '../src/app.js';
import { createSessions, SESSION_COOKIE } from '../src/auth/session.js';
import { readConfig } from '../src/config.js';
import { DEMO_CLIENT_ID, DEMO_ROOM_ID } from '../src/db/seed.js';
import { BookingService } from '../src/bookings/service.js';
import { demoPasswords, openTestDatabase, prepareDatabase, resetDatabase } from './helpers.js';

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
const service = new BookingService(database, now);
const customer = { fullName: 'Contacto de prueba', email: 'contacto@example.com' };
const schedule = {
  roomId: DEMO_ROOM_ID,
  date: '2026-10-26',
  startTime: '09:00',
  durationMinutes: 60,
};
const otherOwner = '00000000-0000-4000-8000-000000000998';
let adminCookie: string;
let clientCookie: string;
let adminId: string;
const decode = (response: { body: unknown }) => bookingResponseSchema.parse(response.body).booking;
const get = (path: string, cookie = adminCookie) =>
  request(app).get(`/api/admin${path}`).set('Cookie', cookie);
const post = (path: string, body: object, cookie = adminCookie) =>
  request(app).post(`/api/admin${path}`).set('Origin', origin).set('Cookie', cookie).send(body);
async function confirmed(
  input: Partial<typeof schedule> = {},
  ownerId = DEMO_CLIENT_ID,
): Promise<Booking> {
  let booking = await service.create(ownerId, { clientRequestId: randomUUID(), customer });
  booking = await service.save(ownerId, booking.id, {
    step: 2,
    expectedVersion: booking.version,
    ...schedule,
    ...input,
  });
  booking = await service.save(ownerId, booking.id, {
    step: 3,
    expectedVersion: booking.version,
    serviceCodes: ['coffee'],
  });
  return service.confirm(ownerId, booking.id, { expectedVersion: booking.version });
}
async function details(id: string) {
  return adminBookingDetailSchema.parse((await get(`/bookings/${id}`).expect(200)).body);
}
async function eventId(bookingId: string): Promise<string> {
  return (await database.pool.query('SELECT id FROM email_outbox WHERE booking_id=$1', [bookingId]))
    .rows[0].id;
}
async function catalogQuote() {
  return request(app)
    .post('/api/quotes')
    .set('Origin', origin)
    .set('Cookie', clientCookie)
    .send({ ...schedule, serviceCodes: [] })
    .expect(200);
}
async function fillBookings() {
  await database.pool.query('DELETE FROM bookings');
  const ids = Array.from(
    { length: 27 },
    (_, index) => `00000000-0000-4000-8000-${(1000 + index).toString(16).padStart(12, '0')}`,
  );
  for (const [index, id] of ids.entries())
    await database.pool.query(
      "INSERT INTO bookings (id,owner_id,client_request_id,create_request_hash,room_id,created_at) VALUES ($1,$2,$3,'admin-fixture',$4,'2026-10-23T12:00:00-05:00')",
      [
        id,
        index % 2 ? DEMO_CLIENT_ID : otherOwner,
        randomUUID(),
        index % 3 ? DEMO_ROOM_ID : '00000000-0000-4000-8000-000000000202',
      ],
    );
  return ids;
}

beforeAll(() => prepareDatabase(database));
beforeEach(async () => {
  clock = new Date('2026-10-23T17:00:00Z');
  await resetDatabase(database);
  await database.pool.query(
    "INSERT INTO users (id,email,password_hash,role,full_name) VALUES ($1,'otro-cliente@example.com','test','client','Otro cliente de prueba')",
    [otherOwner],
  );
  adminId = (await database.pool.query("SELECT id FROM users WHERE role='admin'")).rows[0].id;
  const sessions = createSessions(database, config, now);
  adminCookie = `${SESSION_COOKIE}=${await sessions.issue(adminId)}`;
  clientCookie = `${SESSION_COOKIE}=${await sessions.issue(DEMO_CLIENT_ID)}`;
});
afterAll(() => database.pool.end());

describe('Administración por HTTP con PostgreSQL real', () => {
  it('todas las rutas exigen sesión y rol admin, incluso con role manipulado', async () => {
    const id = randomUUID();
    for (const cookie of ['', clientCookie]) {
      const expected = cookie ? 403 : 401;
      for (const path of ['/bookings', `/bookings/${id}`, '/emails', `/emails/${id}`])
        await get(path, cookie).expect(expected);
      for (const action of ['cancel', 'complete'])
        await post(
          `/bookings/${id}/${action}`,
          { expectedVersion: 1, reason: 'Cambio', role: 'admin' },
          cookie,
        ).expect(expected);
    }
    await get('/bookings?role=admin', clientCookie).expect(403);
  });
  it('sesión inventada, caducada y cerrada no permiten leer administración', async () => {
    await get('/bookings', `${SESSION_COOKIE}=${'a'.repeat(43)}`).expect(401);
    await get('/emails', `${SESSION_COOKIE}=malformed`).expect(401);
    clock = new Date(clock.getTime() + config.sessionTtlMs + 1);
    await get('/bookings').expect(401);
    await get('/emails').expect(401);
    const cookie = `${SESSION_COOKIE}=${await createSessions(database, config, now).issue(adminId)}`;
    await request(app)
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(204);
    await get('/bookings', cookie).expect(401);
  });
  it('pagina más de 20 filas con orden estable, sin duplicar ni omitir dueños diferentes', async () => {
    const ids = await fillBookings();
    const first = adminBookingPageSchema.parse((await get('/bookings').expect(200)).body);
    const second = adminBookingPageSchema.parse((await get('/bookings?page=2').expect(200)).body);
    expect(first).toMatchObject({ total: 27, page: 1, pageSize: 20 });
    expect(second).toMatchObject({ total: 27, page: 2, pageSize: 20 });
    const combined = [...first.items, ...second.items];
    expect(combined.map((row) => row.id)).toEqual([...ids].reverse());
    expect(new Set(combined.map((row) => row.ownerId)).size).toBe(2);
    expect(new Set(combined.map((row) => row.id)).size).toBe(27);
    expect((await get('/bookings?page=3').expect(200)).body).toMatchObject({
      items: [],
      total: 27,
    });
  });
  it('combina filtros de estado y sala y cuenta solo los resultados filtrados', async () => {
    const first = await confirmed();
    const second = await confirmed({ roomId: '00000000-0000-4000-8000-000000000202' }, otherOwner);
    const third = await confirmed({ startTime: '10:00' });
    await post(`/bookings/${third.id}/cancel`, {
      expectedVersion: third.version,
      reason: 'Cambio de planes',
    }).expect(200);
    const filtered = adminBookingPageSchema.parse(
      (await get(`/bookings?status=confirmed&roomId=${DEMO_ROOM_ID}&pageSize=1`).expect(200)).body,
    );
    expect(filtered.total).toBe(1);
    expect(filtered.items.map((row) => row.id)).toEqual([first.id]);
    const cancelled = adminBookingPageSchema.parse(
      (await get(`/bookings?status=cancelled&roomId=${DEMO_ROOM_ID}`).expect(200)).body,
    );
    expect(cancelled.items.map((row) => row.id)).toEqual([third.id]);
    const other = adminBookingPageSchema.parse(
      (await get(`/bookings?roomId=${second.roomId}`).expect(200)).body,
    );
    expect(other.items.map((row) => row.id)).toEqual([second.id]);
  });
  it('detalle muestra snapshot, líneas, correo pending y permite ver reservas de cualquier dueño', async () => {
    const booking = await confirmed({}, otherOwner);
    const result = await details(booking.id);
    expect(result.booking).toEqual(booking);
    expect(result.email).toMatchObject({
      bookingId: booking.id,
      status: 'pending',
      attempts: 0,
      lastError: null,
      capturedEmailId: null,
    });
    expect(result.lines.reduce((sum, line) => sum + line.amountCop, 0)).toBe(
      booking.quoteSnapshot!.breakdown.total,
    );
    expect(result.lines).toHaveLength(4);
    expect(JSON.stringify(result)).not.toMatch(/password|createRequestHash|tokenHash/);
    const draft = await service.create(DEMO_CLIENT_ID, { clientRequestId: randomUUID() });
    expect(await details(draft.id)).toMatchObject({ lines: [], email: null });
    await request(app).get(`/api/bookings/${booking.id}`).set('Cookie', clientCookie).expect(404);
  });
  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 'a'.repeat(1001) }])(
    'cancelar exige motivo de negocio válido (%j)',
    async (body) => {
      const booking = await confirmed();
      await post(`/bookings/${booking.id}/cancel`, {
        expectedVersion: booking.version,
        ...body,
      }).expect(422);
      expect((await details(booking.id)).booking).toEqual(booking);
    },
  );
  it('cancelar conserva motivo/importe/líneas/correo y libera disponibilidad; repetir es 409', async () => {
    const booking = await confirmed();
    const before = await details(booking.id);
    const event = emailDetailSchema.parse(
      (await get(`/emails/${before.email!.id}`).expect(200)).body,
    );
    expect((await catalogQuote()).body.canBook).toBe(false);
    await database.pool.query('UPDATE rooms SET hourly_rate_cop=99000 WHERE id=$1', [DEMO_ROOM_ID]);
    const changed = decode(
      await post(`/bookings/${booking.id}/cancel`, {
        expectedVersion: booking.version,
        reason: '  Cambio solicitado  ',
      }).expect(200),
    );
    expect(changed).toMatchObject({
      status: 'cancelled',
      version: booking.version + 1,
      cancellationReason: 'Cambio solicitado',
      cancelledAt: now().toISOString(),
      quoteSnapshot: booking.quoteSnapshot,
    });
    const after = await details(booking.id);
    expect(after.lines).toEqual(before.lines);
    expect(after.email).toEqual(before.email);
    expect(
      emailDetailSchema.parse((await get(`/emails/${before.email!.id}`).expect(200)).body),
    ).toEqual(event);
    expect((await catalogQuote()).body.canBook).toBe(true);
    await post(`/bookings/${booking.id}/cancel`, {
      expectedVersion: changed.version,
      reason: 'Otra vez',
    }).expect(409);
    await request(app)
      .post(`/api/bookings/${booking.id}/confirm`)
      .set('Origin', origin)
      .set('Cookie', clientCookie)
      .send({ expectedVersion: changed.version })
      .expect(409);
  });
  it('una versión obsoleta no cancela ni altera líneas o correo', async () => {
    const booking = await confirmed();
    const before = await details(booking.id);
    await post(`/bookings/${booking.id}/cancel`, {
      expectedVersion: booking.version - 1,
      reason: 'Cambio',
    }).expect(409);
    expect(await details(booking.id)).toEqual(before);
  });
  it('dos cancelaciones simultáneas producen un éxito y un conflicto sin perder motivo', async () => {
    const booking = await confirmed();
    const results = await Promise.all([
      post(`/bookings/${booking.id}/cancel`, {
        expectedVersion: booking.version,
        reason: 'Primero',
      }),
      post(`/bookings/${booking.id}/cancel`, {
        expectedVersion: booking.version,
        reason: 'Segundo',
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const winner = decode(results.find((result) => result.status === 200)!);
    expect((await details(booking.id)).booking).toEqual(winner);
    expect(
      (
        await database.pool.query(
          'SELECT count(*)::int count FROM email_outbox WHERE booking_id=$1',
          [booking.id],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it('completar exige fin alcanzado y versión actual; no revierte completed ni altera precio/correo', async () => {
    const booking = await confirmed();
    await post(`/bookings/${booking.id}/complete`, { expectedVersion: booking.version }).expect(
      409,
    );
    clock = new Date(booking.endsAt!);
    adminCookie = `${SESSION_COOKIE}=${await createSessions(database, config, now).issue(adminId)}`;
    const before = await details(booking.id);
    await post(`/bookings/${booking.id}/complete`, { expectedVersion: booking.version - 1 }).expect(
      409,
    );
    const completed = decode(
      await post(`/bookings/${booking.id}/complete`, { expectedVersion: booking.version }).expect(
        200,
      ),
    );
    expect(completed).toMatchObject({
      status: 'completed',
      version: booking.version + 1,
      quoteSnapshot: booking.quoteSnapshot,
      confirmedAt: booking.confirmedAt,
      cancellationReason: null,
    });
    expect((await details(booking.id)).lines).toEqual(before.lines);
    expect((await details(booking.id)).email).toEqual(before.email);
    await post(`/bookings/${booking.id}/complete`, { expectedVersion: completed.version }).expect(
      409,
    );
    await post(`/bookings/${booking.id}/cancel`, {
      expectedVersion: completed.version,
      reason: 'Cambio',
    }).expect(409);
    clientCookie = `${SESSION_COOKIE}=${await createSessions(database, config, now).issue(DEMO_CLIENT_ID)}`;
    await request(app)
      .post(`/api/bookings/${booking.id}/confirm`)
      .set('Origin', origin)
      .set('Cookie', clientCookie)
      .send({ expectedVersion: completed.version })
      .expect(409);
  });
  it('cancelar y completar simultáneamente compiten por la misma fila', async () => {
    const booking = await confirmed();
    clock = new Date(booking.endsAt!);
    adminCookie = `${SESSION_COOKIE}=${await createSessions(database, config, now).issue(adminId)}`;
    const results = await Promise.all([
      post(`/bookings/${booking.id}/cancel`, {
        expectedVersion: booking.version,
        reason: 'Cambio',
      }),
      post(`/bookings/${booking.id}/complete`, { expectedVersion: booking.version }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const winner = decode(results.find((result) => result.status === 200)!);
    expect((await details(booking.id)).booking).toEqual(winner);
  });
  it('borradores no se cancelan ni completan y canceladas no se completan', async () => {
    const draft = await service.create(DEMO_CLIENT_ID, { clientRequestId: randomUUID() });
    for (const action of ['cancel', 'complete'])
      await post(`/bookings/${draft.id}/${action}`, {
        expectedVersion: draft.version,
        ...(action === 'cancel' ? { reason: 'Cambio' } : {}),
      }).expect(409);
    const booking = await confirmed();
    const cancelled = decode(
      await post(`/bookings/${booking.id}/cancel`, {
        expectedVersion: booking.version,
        reason: 'Cambio',
      }).expect(200),
    );
    await post(`/bookings/${booking.id}/complete`, { expectedVersion: cancelled.version }).expect(
      409,
    );
  });
  it('listado de correo distingue pending, failed y sent con captura; detalle usa ID del evento', async () => {
    const pending = await confirmed();
    const failed = await confirmed({ startTime: '10:00' });
    const sent = await confirmed({ startTime: '11:00' });
    const pendingId = await eventId(pending.id),
      failedId = await eventId(failed.id),
      sentId = await eventId(sent.id);
    await database.pool.query(
      "UPDATE email_outbox SET status='failed',attempts=6,last_error='Fallo simulado de prueba' WHERE id=$1",
      [failedId],
    );
    await database.pool.query(
      "UPDATE email_outbox SET status='sent',attempts=1,sent_at=$2 WHERE id=$1",
      [sentId, now()],
    );
    const captureId = randomUUID();
    await database.pool.query(
      "INSERT INTO captured_emails (id,dedup_key,booking_id,to_email,subject,text_body,captured_at) SELECT $1,dedup_key,booking_id,payload->>'toEmail',payload->>'subject',payload->>'textBody',$3 FROM email_outbox WHERE id=$2",
      [captureId, sentId, now()],
    );
    const list = emailQueuePageSchema.parse((await get('/emails').expect(200)).body);
    expect(list.total).toBe(3);
    expect(list.items.find((item) => item.id === pendingId)).toMatchObject({
      status: 'pending',
      attempts: 0,
      capturedEmailId: null,
      lastError: null,
    });
    const filtered = emailQueuePageSchema.parse(
      (await get('/emails?status=failed').expect(200)).body,
    );
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]).toMatchObject({
      id: failedId,
      attempts: 6,
      lastError: 'Fallo simulado de prueba',
    });
    const failedDetail = emailDetailSchema.parse(
      (await get(`/emails/${failedId}`).expect(200)).body,
    );
    expect(failedDetail.capture).toBeNull();
    expect(failedDetail.payload.toEmail).toBe(customer.email);
    const sentDetail = emailDetailSchema.parse((await get(`/emails/${sentId}`).expect(200)).body);
    expect(sentDetail.event).toMatchObject({
      status: 'sent',
      capturedEmailId: captureId,
      attempts: 1,
    });
    expect(sentDetail.capture).toMatchObject({
      id: captureId,
      bookingId: sent.id,
      toEmail: customer.email,
    });
    expect((await details(failed.id)).email).toMatchObject({ status: 'failed', attempts: 6 });
    await get(`/emails/${captureId}`).expect(404);
    await get(`/emails/${sent.id}`).expect(404);
  });
  it('pagina correo por SQL con total filtrado y orden estable sin omisiones', async () => {
    const ids = await fillBookings();
    for (const id of ids)
      await database.pool.query(
        "INSERT INTO email_outbox (booking_id,dedup_key,payload,created_at) VALUES ($1,$2,$3,'2026-10-23T12:00:00-05:00')",
        [
          id,
          `booking-confirmed:${id}`,
          JSON.stringify({
            toEmail: customer.email,
            subject: 'Fixture',
            textBody: 'Correo de prueba',
          }),
        ],
      );
    const first = emailQueuePageSchema.parse(
      (await get('/emails?status=pending&pageSize=20').expect(200)).body,
    );
    const second = emailQueuePageSchema.parse(
      (await get('/emails?status=pending&pageSize=20&page=2').expect(200)).body,
    );
    expect(first.total).toBe(27);
    expect(second.total).toBe(27);
    const combined = [...first.items, ...second.items];
    expect(new Set(combined.map((row) => row.id)).size).toBe(27);
    expect(combined.map((row) => row.id)).toEqual(
      combined
        .map((row) => row.id)
        .sort()
        .reverse(),
    );
    expect((await get('/emails?page=3').expect(200)).body).toMatchObject({ items: [], total: 27 });
  });
  it('UUID y consultas malformadas, importes/rol/estado y Origin inválido se rechazan sin mutar', async () => {
    const booking = await confirmed();
    const before = await details(booking.id);
    for (const extra of [
      { role: 'admin' },
      { ownerId: otherOwner },
      { status: 'completed' },
      { total: 1 },
    ])
      await post(`/bookings/${booking.id}/cancel`, {
        expectedVersion: booking.version,
        reason: 'Cambio',
        ...extra,
      }).expect(400);
    await post(`/bookings/${booking.id}/cancel`, {
      expectedVersion: booking.version,
      reason: 123,
    }).expect(400);
    await post(`/bookings/${booking.id}/complete`, {
      expectedVersion: booking.version,
      reason: 'No permitido',
    }).expect(400);
    for (const path of ['/bookings', '/emails']) {
      for (const query of [
        'page=0',
        'page=1.5',
        'pageSize=101',
        'pageSize=-1',
        'status=unknown',
        'role=admin',
        'page=9007199254740991&pageSize=100',
      ])
        await get(`${path}?${query}`).expect(400);
    }
    await get('/bookings?roomId=wrong').expect(400);
    for (const path of ['/bookings/wrong', '/emails/wrong']) await get(path).expect(400);
    await get(`/bookings/${randomUUID()}`).expect(404);
    await get(`/emails/${randomUUID()}`).expect(404);
    await post(`/bookings/${randomUUID()}/cancel`, { expectedVersion: 1, reason: 'Cambio' }).expect(
      404,
    );
    await request(app)
      .post(`/api/admin/bookings/${booking.id}/cancel`)
      .set('Cookie', adminCookie)
      .send({ expectedVersion: booking.version, reason: 'Cambio' })
      .expect(403);
    await request(app)
      .post(`/api/admin/bookings/${booking.id}/cancel`)
      .set('Cookie', adminCookie)
      .set('Origin', 'https://attacker.example')
      .send({ expectedVersion: booking.version, reason: 'Cambio' })
      .expect(403);
    expect(await details(booking.id)).toEqual(before);
  });
  it('permisos provienen del usuario real en DB y no de datos de la sesión enviados por cliente', async () => {
    await get('/bookings', clientCookie).expect(403);
    await database.pool.query("UPDATE users SET role='client' WHERE id=$1", [adminId]);
    await get('/bookings').expect(403);
    await get('/emails').expect(403);
  });
  it('login renueva token, invalida el anterior y logout elimina la sesión renovada', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ email: 'admin@example.com', password: demoPasswords.adminPassword })
      .expect(200);
    const header: unknown = login.headers['set-cookie'];
    const value: unknown = Array.isArray(header) ? header[0] : header;
    if (typeof value !== 'string') throw new Error('Falta cookie de sesión');
    const cookie = value.split(';')[0]!;
    expect(cookie).not.toBe(adminCookie);
    await get('/bookings', adminCookie).expect(401);
    await get('/bookings', cookie).expect(200);
    await request(app)
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(204);
    await get('/bookings', cookie).expect(401);
  });
});
