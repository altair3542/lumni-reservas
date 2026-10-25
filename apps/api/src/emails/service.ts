import { and, asc, eq, lt, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { emailPayloadSchema } from '@lumni/shared';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema.js';
import { emailOutbox } from '../db/schema.js';
import { CaptureFailure, LocalCaptureSink, type CaptureSink } from './sink.js';
import { MAX_ATTEMPTS, nextAttemptAt } from './retry.js';

export type DeliveryResult =
  | { status: 'idle' }
  | { status: 'sent' | 'retry' | 'failed'; eventId: string; attempts: number };
export class EmailWorker {
  constructor(
    private readonly database: Database,
    private readonly sink: CaptureSink = new LocalCaptureSink(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processOne(): Promise<DeliveryResult> {
    const now = this.now();
    if (!Number.isFinite(now.getTime())) throw new Error('Reloj inválido');
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '5s'");
      const db = drizzle(client, { schema });
      const [event] = await db
        .select()
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.status, 'pending'),
            lte(emailOutbox.nextAttemptAt, now),
            lt(emailOutbox.attempts, MAX_ATTEMPTS),
          ),
        )
        .orderBy(asc(emailOutbox.nextAttemptAt), asc(emailOutbox.createdAt), asc(emailOutbox.id))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!event) {
        await client.query('COMMIT');
        return { status: 'idle' };
      }
      const attempts = event.attempts + 1;
      // El savepoint permite registrar un reintento incluso cuando una escritura
      // del sink aborta PostgreSQL. El lock del evento se adquirió antes y se conserva.
      await client.query('SAVEPOINT capture_attempt');
      let status: 'sent' | 'retry' | 'failed';
      const payload = emailPayloadSchema.safeParse(event.payload);
      try {
        if (!payload.success) throw new Error('invalid-payload');
        await this.sink.capture(db, { ...event, payload: payload.data }, now);
        await db
          .update(emailOutbox)
          .set({ status: 'sent', attempts, sentAt: now, lastError: null })
          .where(eq(emailOutbox.id, event.id));
        await client.query('RELEASE SAVEPOINT capture_attempt');
        status = 'sent';
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT capture_attempt');
        const next = nextAttemptAt(attempts, now);
        const lastError = !payload.success
          ? 'El contenido del correo no es válido.'
          : error instanceof CaptureFailure && error.kind === 'conflict'
            ? 'Existe una captura con datos incompatibles.'
            : error instanceof CaptureFailure && error.kind === 'simulated'
              ? 'Fallo de captura simulado en entorno local.'
              : 'No se pudo capturar el correo de confirmación.';
        await db
          .update(emailOutbox)
          .set({
            status: next ? 'pending' : 'failed',
            attempts,
            nextAttemptAt: next ?? now,
            lastError,
            sentAt: null,
          })
          .where(eq(emailOutbox.id, event.id));
        status = next ? 'retry' : 'failed';
      }
      // Captura y sent comparten COMMIT. Antes de este punto una caída revierte ambos.
      await client.query('COMMIT');
      return { status, eventId: event.id, attempts };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
