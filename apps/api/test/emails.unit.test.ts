import { describe, expect, it, vi } from 'vitest';
import { nextAttemptAt } from '../src/emails/retry.js';
import { readWorkerConfig } from '../src/emails/config.js';
import { consumeEmails } from '../src/emails/loop.js';

describe('Correo: configuración, reintentos y ciclo', () => {
  it('programa cinco reintentos y termina en el sexto fallo', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    for (const [index, minutes] of [1, 2, 4, 8, 16].entries())
      expect(nextAttemptAt(index + 1, now)?.getTime()).toBe(now.getTime() + minutes * 60000);
    expect(nextAttemptAt(6, now)).toBeNull();
    for (const count of [0, 7, 1.5, NaN]) expect(() => nextAttemptAt(count, now)).toThrow();
    expect(() => nextAttemptAt(1, new Date(NaN))).toThrow();
  });
  it('valida límites y permite simular fallos solo en desarrollo/test', () => {
    const env = { DATABASE_URL: 'postgres://localhost/lumni_test' };
    expect(readWorkerConfig(env)).toMatchObject({
      batchSize: 20,
      pollIntervalMs: 1000,
      failureMode: 'none',
    });
    expect(
      readWorkerConfig({ ...env, NODE_ENV: 'test', EMAIL_FAILURE_MODE: 'first-two' }).failureMode,
    ).toBe('first-two');
    expect(readWorkerConfig({ ...env, NODE_ENV: 'production' }).failureMode).toBe('none');
    for (const mode of ['always', 'first-two'])
      expect(() =>
        readWorkerConfig({ ...env, NODE_ENV: 'production', EMAIL_FAILURE_MODE: mode }),
      ).toThrow();
    for (const invalid of [
      { EMAIL_POLL_INTERVAL_MS: '0' },
      { EMAIL_POLL_INTERVAL_MS: '60001' },
      { EMAIL_BATCH_SIZE: '0' },
      { EMAIL_BATCH_SIZE: '101' },
      { DATABASE_URL: 'https://example.com' },
      { EMAIL_FAILURE_MODE: 'other' },
    ])
      expect(() => readWorkerConfig({ ...env, ...invalid })).toThrow();
  });
  it('detiene un lote sin tomar otro evento después de abortar', async () => {
    const controller = new AbortController();
    const worker = {
      processOne: vi.fn(async () => {
        controller.abort();
        return { status: 'sent' as const, eventId: 'test', attempts: 1 };
      }),
    };
    const result = vi.fn();
    await consumeEmails(worker, {
      signal: controller.signal,
      batchSize: 20,
      pollIntervalMs: 60000,
      onResult: result,
    });
    expect(worker.processOne).toHaveBeenCalledTimes(1);
    expect(result).toHaveBeenCalledOnce();
  });
  it('entrega la causa al manejador de error y permite detener el ciclo', async () => {
    const controller = new AbortController();
    const onError = vi.fn(() => controller.abort());
    const error = new Error('dato privado');
    await consumeEmails(
      {
        processOne: async () => {
          throw error;
        },
      },
      {
        signal: controller.signal,
        batchSize: 1,
        pollIntervalMs: 60000,
        onError,
      },
    );
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  });
});
