import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createSessions } from '../src/auth/session.js';
import { BookingService } from '../src/bookings/service.js';
import { DEMO_CLIENT_ID, DEMO_ROOM_ID } from '../src/db/seed.js';
import { EmailWorker } from '../src/emails/service.js';
import { createCaptureSink, LocalCaptureSink, type CaptureSink } from '../src/emails/sink.js';
import { openTestDatabase, prepareDatabase, resetDatabase } from './helpers.js';

const database = openTestDatabase();
let clock = new Date('2026-10-23T17:00:00Z');
const now = () => clock;
const bookings = new BookingService(database, now);
const config = readConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: 'test' });
const app = createApp({ database, config, now, logError: () => {} });
async function confirmed(startTime = '09:00') {
  let booking = await bookings.create(DEMO_CLIENT_ID, {
    clientRequestId: randomUUID(),
    customer: { fullName: 'Correo de prueba', email: 'correo@example.com' },
  });
  booking = await bookings.save(DEMO_CLIENT_ID, booking.id, {
    step: 2,
    expectedVersion: booking.version,
    roomId: DEMO_ROOM_ID,
    date: '2026-10-26',
    startTime,
    durationMinutes: 60,
  });
  booking = await bookings.save(DEMO_CLIENT_ID, booking.id, {
    step: 3,
    expectedVersion: booking.version,
    serviceCodes: ['coffee'],
  });
  return bookings.confirm(DEMO_CLIENT_ID, booking.id, { expectedVersion: booking.version });
}
async function event() {
  return (await database.pool.query('SELECT * FROM email_outbox ORDER BY created_at,id LIMIT 1'))
    .rows[0];
}
async function captures() {
  return (await database.pool.query('SELECT * FROM captured_emails ORDER BY booking_id')).rows;
}
const worker = (sink?: CaptureSink) => new EmailWorker(database, sink, now);
async function admin(bookingId: string) {
  const { rows } = await database.pool.query("SELECT id FROM users WHERE role='admin'");
  const cookie = `lumni_session=${await createSessions(database, config, now).issue(rows[0].id)}`;
  return request(app).get(`/api/admin/bookings/${bookingId}`).set('Cookie', cookie).expect(200);
}
function startChild(args: string[], env: NodeJS.ProcessEnv = {}, ipc = false) {
  return spawn(process.execPath, ['--import', 'tsx', ...args], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, ...env },
    stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  });
}
async function stopChild(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit');
  child.kill(signal);
  return exit;
}

beforeAll(() => prepareDatabase(database));
beforeEach(async () => {
  clock = new Date('2026-10-23T17:00:00Z');
  await resetDatabase(database);
});
afterAll(() => database.pool.end());

describe('Worker de captura local con PostgreSQL real', () => {
  it('confirmación independiente, captura única y replay sin recrear el evento', async () => {
    const booking = await confirmed();
    const pending = await event();
    expect(pending).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await captures()).toHaveLength(0);
    expect(await worker().processOne()).toMatchObject({ status: 'sent', attempts: 1 });
    const saved = await captures();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      booking_id: booking.id,
      to_email: 'correo@example.com',
      text_body: pending.payload.textBody,
    });
    expect(saved[0].text_body).toContain('50000 COP');
    expect((await event()).sent_at).toEqual(saved[0].captured_at);
    expect(await bookings.confirm(DEMO_CLIENT_ID, booking.id, { expectedVersion: 1 })).toEqual(
      booking,
    );
    expect(await worker().processOne()).toEqual({ status: 'idle' });
    expect(await captures()).toEqual(saved);
    expect((await database.pool.query('SELECT count(*)::int n FROM email_outbox')).rows[0].n).toBe(
      1,
    );
    const detail = await admin(booking.id);
    expect(detail.body.email.capture).toMatchObject({
      bookingId: booking.id,
      textBody: pending.payload.textBody,
    });
  });
  it('cinco esperas duraderas de 1/2/4/8/16 minutos y sexto fallo visible en admin', async () => {
    const booking = await confirmed();
    for (let attempt = 1; attempt <= 6; attempt++) {
      const before = clock.getTime();
      expect(await worker(createCaptureSink('always')).processOne()).toMatchObject({
        status: attempt < 6 ? 'retry' : 'failed',
        attempts: attempt,
      });
      const row = await event();
      expect(row.attempts).toBe(attempt);
      expect(row.last_error).toBe('Fallo de captura simulado en entorno local.');
      expect(await captures()).toHaveLength(0);
      if (attempt < 6) {
        expect(row.next_attempt_at.getTime() - before).toBe(2 ** (attempt - 1) * 60000);
        clock = new Date(row.next_attempt_at.getTime() - 1);
        expect(await worker().processOne()).toEqual({ status: 'idle' });
        expect((await event()).attempts).toBe(attempt);
        clock = row.next_attempt_at;
      }
    }
    clock = new Date(clock.getTime() + 86400000);
    expect(await worker().processOne()).toEqual({ status: 'idle' });
    const detail = await admin(booking.id);
    expect(detail.body.email).toMatchObject({ status: 'failed', attempts: 6 });
    expect(detail.body.email.capture).toBeNull();
  });
  it('reintentos sobreviven a reinicios y dos consumidores capturan una sola vez', async () => {
    await confirmed();
    for (let attempt = 1; attempt <= 2; attempt++) {
      expect(await worker(createCaptureSink('first-two')).processOne()).toMatchObject({
        status: 'retry',
        attempts: attempt,
      });
      clock = (await event()).next_attempt_at;
    }
    const results = await Promise.all([
      worker(createCaptureSink('first-two')).processOne(),
      worker(createCaptureSink('first-two')).processOne(),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['idle', 'sent']);
    expect((await event()).attempts).toBe(3);
    expect(await captures()).toHaveLength(1);
  });
  it('SKIP LOCKED permite a otro worker avanzar sin esperar un evento ocupado', async () => {
    await confirmed();
    await confirmed('10:00');
    let entered!: () => void, release!: () => void;
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const local = new LocalCaptureSink();
    const first = worker({
      capture: async (db, item, date) => {
        await local.capture(db, item, date);
        entered();
        await gate;
      },
    }).processOne();
    try {
      await inside;
      const second = await worker().processOne();
      expect(second.status).toBe('sent');
      expect(await captures()).toHaveLength(1);
    } finally {
      release();
      await first;
    }
    expect(await captures()).toHaveLength(2);
    expect(
      (
        await database.pool.query(
          "SELECT count(*)::int n FROM email_outbox WHERE status='sent' AND attempts=1",
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it('revierte una captura parcial y registra un error sin datos privados', async () => {
    await confirmed();
    const local = new LocalCaptureSink();
    expect(
      await worker({
        capture: async (db, item, date) => {
          await local.capture(db, item, date);
          throw new Error('correo@example.com password=secreto');
        },
      }).processOne(),
    ).toMatchObject({ status: 'retry', attempts: 1 });
    expect(await captures()).toHaveLength(0);
    expect((await event()).last_error).toBe('No se pudo capturar el correo de confirmación.');
    clock = (await event()).next_attempt_at;
    expect(await worker().processOne()).toMatchObject({ status: 'sent', attempts: 2 });
    expect(await captures()).toHaveLength(1);
  });
  it('un error SQL aborta el intento pero no impide guardar el reintento', async () => {
    await confirmed();
    await database.pool.query(
      "CREATE FUNCTION test_reject_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SQL failure'; END $$",
    );
    await database.pool.query(
      'CREATE TRIGGER test_reject_capture BEFORE INSERT ON captured_emails FOR EACH ROW EXECUTE FUNCTION test_reject_capture()',
    );
    try {
      expect(await worker().processOne()).toMatchObject({ status: 'retry', attempts: 1 });
      expect(await captures()).toHaveLength(0);
      expect((await event()).status).toBe('pending');
    } finally {
      await database.pool.query('DROP TRIGGER test_reject_capture ON captured_emails');
      await database.pool.query('DROP FUNCTION test_reject_capture()');
    }
    clock = (await event()).next_attempt_at;
    expect(await worker().processOne()).toMatchObject({ status: 'sent', attempts: 2 });
  });
  it('recupera una captura idéntica y rechaza reemplazar un histórico incompatible', async () => {
    await confirmed();
    await worker().processOne();
    const original = await captures();
    await database.pool.query("UPDATE email_outbox SET status='pending',sent_at=NULL");
    expect(await worker().processOne()).toMatchObject({ status: 'sent' });
    expect(await captures()).toEqual(original);
    await database.pool.query(
      "UPDATE email_outbox SET status='pending',sent_at=NULL,payload=jsonb_set(payload,'{textBody}','\"contenido cambiado\"')",
    );
    expect(await worker().processOne()).toMatchObject({ status: 'retry' });
    expect((await event()).last_error).toBe('Existe una captura con datos incompatibles.');
    expect(await captures()).toEqual(original);
  });
  it('UNIQUE booking_id y dedup_key se aplican en outbox y capturas', async () => {
    const booking = await confirmed();
    await worker().processOne();
    await expect(
      database.pool.query(
        "INSERT INTO email_outbox(booking_id,dedup_key,payload) SELECT booking_id,'otra-clave',payload FROM email_outbox WHERE booking_id=$1",
        [booking.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.pool.query(
        "INSERT INTO captured_emails(booking_id,dedup_key,to_email,subject,text_body) SELECT booking_id,'otra-clave',to_email,subject,text_body FROM captured_emails WHERE booking_id=$1",
        [booking.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    const draft = await bookings.create(DEMO_CLIENT_ID, { clientRequestId: randomUUID() });
    await expect(
      database.pool.query(
        'INSERT INTO email_outbox(booking_id,dedup_key,payload) SELECT $1,dedup_key,payload FROM email_outbox',
        [draft.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.pool.query(
        'INSERT INTO captured_emails(booking_id,dedup_key,to_email,subject,text_body) SELECT $1,dedup_key,to_email,subject,text_body FROM captured_emails',
        [draft.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it.each(['before', 'after'])(
    'SIGKILL %s COMMIT: reinicio conserva exactamente una captura',
    async (mode) => {
      await confirmed();
      const child = startChild(['test/fixtures/email-crash.ts', mode], {}, true);
      let stderr = '';
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
      try {
        const message = once(child, 'message');
        const exited = once(child, 'exit').then(() => {
          throw new Error(`Fixture terminó antes de tiempo: ${stderr}`);
        });
        const [payload] = await Promise.race([message, exited]);
        expect(payload).toEqual({ phase: mode === 'before' ? 'captured' : 'committed' });
        expect(await captures()).toHaveLength(mode === 'before' ? 0 : 1);
        await stopChild(child, 'SIGKILL');
        await expect
          .poll(async () => (await worker().processOne()).status)
          .toBe(mode === 'before' ? 'sent' : 'idle');
        expect(await captures()).toHaveLength(1);
        expect((await event()).attempts).toBe(1);
        expect(await worker().processOne()).toEqual({ status: 'idle' });
      } finally {
        await stopChild(child, 'SIGKILL');
      }
    },
  );
  it('el proceso real consume, publica salud y sale con SIGTERM durante una espera larga', async () => {
    await confirmed();
    const dir = await mkdtemp(join(tmpdir(), 'lumni-worker-test-'));
    const marker = join(dir, 'health');
    const child = startChild(['src/worker.ts'], {
      EMAIL_HEALTH_FILE: marker,
      EMAIL_POLL_INTERVAL_MS: '60000',
      EMAIL_FAILURE_MODE: 'none',
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk;
    });
    try {
      await expect.poll(() => output, { timeout: 8000 }).toContain('Worker de correo iniciado');
      await access(marker);
      expect(await captures()).toHaveLength(1);
      const exit = await stopChild(child, 'SIGTERM');
      expect(exit?.[0]).toBe(0);
      await expect(access(marker)).rejects.toThrow();
    } finally {
      await stopChild(child, 'SIGKILL');
      await rm(dir, { recursive: true, force: true });
    }
  });
});
