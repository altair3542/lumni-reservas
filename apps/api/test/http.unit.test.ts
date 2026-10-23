import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express, { type ErrorRequestHandler } from 'express';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createDatabase } from '../src/db/client.js';
import { requireRole } from '../src/auth/session.js';
import { errorResponseSchema } from '@lumni/shared';
const database = createDatabase('postgresql://unused@127.0.0.1:1/lumni_test');
const config = readConfig({ DATABASE_URL: 'postgresql://unused@127.0.0.1:1/lumni_test' });
const app = createApp({ database, config, logError: () => undefined });
const origin = config.webOrigin;
afterAll(() => database.pool.end());
describe('HTTP sin dependencia de una base disponible (no sustituye integración)', () => {
  it.each(['/api/me', '/api/rooms', '/api/services'])('protege %s sin cookie', async path => {
    const response = await request(app).get(path).expect(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED');
    expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
  });
  it('informa indisponibilidad real de conexión sin exponer detalles de BD', async () => {
    const response = await request(app).get('/api/health').expect(503);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toMatch(/postgres|127\.0\.0\.1|ECONNREFUSED|stack/);
  });
  it('rechaza Origin ajeno o ausente antes de autenticar', async () => {
    await request(app).post('/api/auth/login').send({}).expect(403);
    await request(app).post('/api/auth/login').set('Origin', 'https://other.example').send({}).expect(403);
  });
  it('valida esquema estricto, JSON roto y tamaño antes de consultar BD', async () => {
    const invalid = await request(app).post('/api/auth/login').set('Origin', origin).send({ email: 'no-email', password: 'x', role: 'admin' }).expect(400);
    expect(errorResponseSchema.parse(invalid.body).error.code).toBe('INVALID_INPUT');
    const json = await request(app).post('/api/auth/login').set('Origin', origin).set('Content-Type', 'application/json').send('{').expect(400);
    expect(errorResponseSchema.parse(json.body).error.code).toBe('INVALID_JSON');
    const large = await request(app).post('/api/auth/login').set('Origin', origin).send({ text: 'x'.repeat(20000) }).expect(413);
    expect(errorResponseSchema.parse(large.body).error.code).toBe('BODY_TOO_LARGE');
  });
  it('mantiene el formato de error para rutas inexistentes', async () => {
    const response = await request(app).get('/inexistente').expect(404);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it.each([['client', 403], ['admin', 204]] as const)('comprueba el rol %s en middleware puro', async (role, status) => {
    const harness = express();
    harness.use((req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-000000000101', role, email: 'demo@example.com', fullName: 'Demo' }; next(); });
    harness.get('/admin', requireRole('admin'), (_req, res) => res.sendStatus(204));
    const errors: ErrorRequestHandler = (err, _req, res, _next) => { res.sendStatus(err.status); };
    harness.use(errors);
    await request(harness).get('/admin').expect(status);
  });
});
