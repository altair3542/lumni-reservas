import { afterAll, describe, expect, it, vi } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { createLoginLimiter } from '../src/auth/login-limit.js';
import { errorDetails } from '../src/http/error-details.js';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { readConfig } from '../src/config.js';

const database = createDatabase('postgresql://unused@127.0.0.1:1/lumni_test');
afterAll(() => database.pool.end());

describe('Login limitado y diagnósticos sin contenido privado', () => {
  it('un burst concurrente se limita aunque cambie X-Forwarded-For; se recupera al vencer la ventana', async () => {
    let clock = new Date('2026-10-27T12:00:00Z');
    const app = express();
    const costlyWork = vi.fn();
    app.post(
      '/login',
      createLoginLimiter(() => clock),
      (_req, res) => {
        costlyWork();
        res.sendStatus(204);
      },
    );
    const errors: ErrorRequestHandler = (error, _req, res, _next) =>
      res.status(error.status).json({ code: error.code });
    app.use(errors);
    const responses = await Promise.all(
      Array.from({ length: 31 }, (_, i) =>
        request(app)
          .post('/login')
          .set('X-Forwarded-For', `192.0.2.${i + 1}`),
      ),
    );
    expect(responses.filter((r) => r.status === 204)).toHaveLength(30);
    const blocked = responses.find((r) => r.status === 429)!;
    expect(blocked.body.code).toBe('LOGIN_RATE_LIMIT');
    expect(blocked.headers['retry-after']).toBe('60');
    expect(costlyWork).toHaveBeenCalledTimes(30);
    clock = new Date(clock.getTime() + 59000);
    expect((await request(app).post('/login').expect(429)).headers['retry-after']).toBe('1');
    clock = new Date(clock.getTime() + 1000);
    await request(app).post('/login').expect(204);
    expect(costlyWork).toHaveBeenCalledTimes(31);
  });

  it('extrae SQLSTATE de la causa sin copiar SQL, parámetros, stack ni mensajes', () => {
    const cause = Object.assign(new Error('clave privada y SQL'), {
      code: '23505',
      detail: 'contacto privado',
    });
    const error = new Error('SELECT ... parámetros privados', { cause });
    expect(errorDetails(error)).toEqual({ type: 'Error', code: '23505' });
    expect(JSON.stringify(errorDetails(error))).not.toMatch(/privad|SELECT|stack|detail/);
  });

  it('conserva códigos de red y descarta códigos arbitrarios o nombres de error privados', () => {
    expect(
      errorDetails(Object.assign(new Error('conexión privada'), { code: 'ECONNREFUSED' })),
    ).toEqual({ type: 'Error', code: 'ECONNREFUSED' });
    expect(
      errorDetails(
        Object.assign(new TypeError('dato privado'), { name: 'privado', code: 'token-secreto' }),
      ),
    ).toEqual({ type: 'TypeError' });
    expect(errorDetails('contraseña privada')).toEqual({ type: 'UnknownError' });
  });

  it('el 500 y su log comparten requestId sin exponer la excepción al cliente o al logger', async () => {
    const logError = vi.fn();
    const app = createApp({
      database,
      config: readConfig({ DATABASE_URL: 'postgresql://unused@127.0.0.1:1/lumni_test' }),
      logError,
    });
    const failure = Object.assign(new Error('password=secreto; SELECT datos'), { code: '23505' });
    const select = vi.spyOn(database.db, 'select').mockImplementationOnce(() => {
      throw failure;
    });
    try {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: 'cliente@example.com', password: 'clave-privada' })
        .expect(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(logError).toHaveBeenCalledExactlyOnceWith(response.body.error.requestId, {
        type: 'Error',
        code: '23505',
      });
      expect(JSON.stringify([response.body, logError.mock.calls])).not.toMatch(
        /secreto|SELECT|clave-privada|stack/,
      );
    } finally {
      select.mockRestore();
    }
  });
});
