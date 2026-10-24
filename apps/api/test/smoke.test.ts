import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import {
  errorResponseSchema,
  loginResponseSchema,
  roomListSchema,
  serviceListSchema,
} from '@lumni/shared';
import { createSessions, requireRole } from '../src/auth/session.js';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import { seedDatabase } from '../src/db/seed.js';
import { demoPasswords, openTestDatabase, prepareDatabase, resetDatabase } from './helpers.js';
function cookieOf(response: request.Response): string {
  const value = response.headers['set-cookie'];
  const cookie: unknown = Array.isArray(value) ? value[0] : value;
  if (typeof cookie !== 'string') throw new Error('Falta cookie de sesión');
  return cookie;
}
const database = openTestDatabase();
const origin = 'http://localhost:5173';
const config = readConfig({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  NODE_ENV: 'test',
  WEB_ORIGIN: origin,
});
let clock = new Date('2026-10-23T17:00:00Z');
const app = createApp({ database, config, now: () => clock, logError: () => undefined });
const credentials = { email: 'cliente@example.com', password: demoPasswords.clientPassword };
beforeAll(() => prepareDatabase(database));
beforeEach(async () => {
  clock = new Date('2026-10-23T17:00:00Z');
  await resetDatabase(database);
});
afterAll(() => database.pool.end());
describe('API real + sesiones PostgreSQL', () => {
  it('health confirma conexión; sin sesión no hay perfil ni catálogo', async () => {
    await request(app).get('/api/health').expect(200, { status: 'ok', database: 'up' });
    for (const path of ['/api/me', '/api/rooms', '/api/services']) {
      const result = await request(app).get(path).expect(401);
      expect(errorResponseSchema.parse(result.body).error.code).toBe('UNAUTHORIZED');
      expect(result.headers['x-request-id']).toBe(result.body.error.requestId);
    }
  });
  it('seed doble conserva 2 usuarios, 3 salas, 2 servicios y 1 draft con fechas futuras', async () => {
    const before = await database.pool.query('SELECT id, password_hash FROM users ORDER BY id');
    await seedDatabase(database, { ...demoPasswords, now: clock });
    expect(
      (await database.pool.query('SELECT id, password_hash FROM users ORDER BY id')).rows,
    ).toEqual(before.rows);
    const counts = await database.pool.query(
      'SELECT (SELECT count(*)::int FROM users) users, (SELECT count(*)::int FROM rooms) rooms, (SELECT count(*)::int FROM services) services, (SELECT count(*)::int FROM bookings) bookings',
    );
    expect(counts.rows[0]).toEqual({ users: 2, rooms: 3, services: 2, bookings: 1 });
    const [draft] = (
      await database.pool.query('SELECT status, starts_at, quote_snapshot FROM bookings')
    ).rows;
    expect(draft.status).toBe('draft');
    expect(draft.starts_at.getTime()).toBeGreaterThan(clock.getTime());
    expect(draft.quote_snapshot).toBeNull();
  });
  it.each([
    ['cliente@example.com', demoPasswords.clientPassword, 'client'],
    ['admin@example.com', demoPasswords.adminPassword, 'admin'],
  ])('autentica %s con cookie opaca y hash en BD', async (email, password, role) => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    expect(loginResponseSchema.parse(login.body).user.role).toBe(role);
    const cookie = cookieOf(login);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    const token = cookie.split(';')[0]!.split('=')[1]!;
    const [stored] = (await database.pool.query('SELECT token_hash FROM sessions')).rows;
    expect(stored.token_hash).not.toBe(token);
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    const me = await agent.get('/api/me').expect(200);
    expect(loginResponseSchema.parse(me.body).user.role).toBe(role);
    expect(JSON.stringify(me.body)).not.toContain('password');
    const catalog = await agent.get('/api/rooms').expect(200);
    expect(roomListSchema.parse(catalog.body).items.map((r) => r.hourlyRateCop)).toEqual([
      40000, 70000, 120000,
    ]);
    expect(
      serviceListSchema.parse((await agent.get('/api/services').expect(200)).body).items,
    ).toHaveLength(2);
    await agent.post('/api/auth/logout').set('Origin', origin).expect(204);
    await agent.get('/api/me').expect(401);
    expect(
      (await database.pool.query('SELECT count(*)::int count FROM sessions')).rows[0].count,
    ).toBe(0);
  });
  it.each([
    ['http://localhost:5173', 'cliente@example.com', demoPasswords.clientPassword, 'client'],
    ['http://127.0.0.1:5173', 'cliente@example.com', demoPasswords.clientPassword, 'client'],
    ['http://localhost:5173', 'admin@example.com', demoPasswords.adminPassword, 'admin'],
    ['http://127.0.0.1:5173', 'admin@example.com', demoPasswords.adminPassword, 'admin'],
  ])('desarrollo permite login/logout de %s y %s', async (origin, email, password, role) => {
    const development = createApp({
      database,
      config: readConfig({
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        NODE_ENV: 'development',
        WEB_ORIGIN: 'http://localhost:5173',
      }),
      now: () => clock,
    });
    const agent = request.agent(development);
    const login = await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    expect(loginResponseSchema.parse(login.body).user.role).toBe(role);
    await agent.get('/api/me').expect(200);
    await agent.post('/api/auth/logout').set('Origin', origin).expect(204);
    await agent.get('/api/me').expect(401);
  });
  it('rechaza login inválido, contraseñas incorrectas, rol inyectado y JSON roto', async () => {
    for (const body of [
      { ...credentials, password: 'incorrecta' },
      { ...credentials, email: 'nadie@example.com' },
    ])
      await request(app).post('/api/auth/login').set('Origin', origin).send(body).expect(401);
    for (const body of [
      { ...credentials, role: 'admin' },
      { ...credentials, email: 'incorrecto' },
    ])
      await request(app).post('/api/auth/login').set('Origin', origin).send(body).expect(400);
    const invalid = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(errorResponseSchema.parse(invalid.body).error.code).toBe('INVALID_JSON');
    expect(
      (await database.pool.query('SELECT count(*)::int count FROM sessions')).rows[0].count,
    ).toBe(0);
  });
  it('exige Origin permitido en login/logout', async () => {
    await request(app).post('/api/auth/login').send(credentials).expect(403);
    await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .send(credentials)
      .expect(403);
    expect(
      (await database.pool.query('SELECT count(*)::int count FROM sessions')).rows[0].count,
    ).toBe(0);
  });
  it('expira sesiones y emite Secure en producción', async () => {
    const production = createApp({
      database,
      config: { ...config, secureCookies: true },
      now: () => clock,
    });
    const login = await request(production)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send(credentials)
      .expect(200);
    expect(cookieOf(login)).toContain('Secure');
    const cookie = cookieOf(login).split(';')[0]!;
    clock = new Date(clock.getTime() + config.sessionTtlMs + 1);
    await request(production).get('/api/me').set('Cookie', cookie).expect(401);
  });
  it('middleware admin rechaza cliente y acepta administrador sin implementar rutas A3', async () => {
    const auth = createSessions(database, config, () => clock);
    const harness = express().use(cookieParser());
    harness.get('/admin', auth.required, requireRole('admin'), (_req, res) => res.sendStatus(204));
    const errors: ErrorRequestHandler = (err, _req, res, _next) => {
      res.sendStatus(err.status);
    };
    harness.use(errors);
    const clientLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send(credentials)
      .expect(200);
    await request(harness)
      .get('/admin')
      .set('Cookie', cookieOf(clientLogin).split(';')[0]!)
      .expect(403);
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@example.com', password: demoPasswords.adminPassword })
      .expect(200);
    await request(harness)
      .get('/admin')
      .set('Cookie', cookieOf(adminLogin).split(';')[0]!)
      .expect(204);
  });
});
