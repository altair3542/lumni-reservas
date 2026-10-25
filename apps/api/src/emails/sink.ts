import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { capturedEmails, emailOutbox } from '../db/schema.js';

export type PendingEmail = Pick<
  typeof emailOutbox.$inferSelect,
  'id' | 'bookingId' | 'dedupKey' | 'payload' | 'attempts'
>;
export interface CaptureSink {
  capture(db: NodePgDatabase<typeof schema>, event: PendingEmail, now: Date): Promise<void>;
}
export class CaptureFailure extends Error {
  constructor(public readonly kind: 'simulated' | 'conflict') {
    super(kind);
  }
}

export class LocalCaptureSink implements CaptureSink {
  async capture(db: NodePgDatabase<typeof schema>, event: PendingEmail, now: Date): Promise<void> {
    const { payload } = event;
    const [inserted] = await db
      .insert(capturedEmails)
      .values({
        dedupKey: event.dedupKey,
        bookingId: event.bookingId,
        toEmail: payload.toEmail,
        subject: payload.subject,
        textBody: payload.textBody,
        htmlBody: payload.htmlBody ?? null,
        capturedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: capturedEmails.id });
    if (inserted) return;
    // Recuperar una captura idéntica es idempotente. Una colisión con otro contenido
    // no se marca como éxito ni reemplaza el histórico.
    const [existing] = await db
      .select()
      .from(capturedEmails)
      .where(eq(capturedEmails.bookingId, event.bookingId));
    if (
      !existing ||
      existing.dedupKey !== event.dedupKey ||
      existing.toEmail !== payload.toEmail ||
      existing.subject !== payload.subject ||
      existing.textBody !== payload.textBody ||
      existing.htmlBody !== (payload.htmlBody ?? null)
    )
      throw new CaptureFailure('conflict');
  }
}

export type FailureMode = 'none' | 'always' | 'first-two';
export function createCaptureSink(mode: FailureMode): CaptureSink {
  const local = new LocalCaptureSink();
  return {
    async capture(db, event, now) {
      if (mode === 'always' || (mode === 'first-two' && event.attempts < 2))
        throw new CaptureFailure('simulated');
      await local.capture(db, event, now);
    },
  };
}
