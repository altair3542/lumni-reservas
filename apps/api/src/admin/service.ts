import { and, count, desc, eq } from 'drizzle-orm';
import {
  adminBookingDetailSchema,
  adminBookingPageSchema,
  adminBookingQuerySchema,
  cancelSchema,
  confirmSchema,
  emailQueueItemSchema,
  textSchema,
  type AdminBookingDetail,
  type AdminBookingPage,
  type Booking,
} from '@lumni/shared';
import type { Database } from '../db/client.js';
import { bookings, bookingLines, capturedEmails, emailOutbox } from '../db/schema.js';
import { serializeBooking } from '../bookings/service.js';
import { transition } from '../bookings/domain.js';
import { HttpError } from '../http/errors.js';

const queueColumns = {
  id: emailOutbox.id,
  bookingId: emailOutbox.bookingId,
  status: emailOutbox.status,
  attempts: emailOutbox.attempts,
  lastError: emailOutbox.lastError,
  capturedEmailId: capturedEmails.id,
  nextAttemptAt: emailOutbox.nextAttemptAt,
  sentAt: emailOutbox.sentAt,
};
type EmailRow = Pick<
  typeof emailOutbox.$inferSelect,
  'id' | 'bookingId' | 'status' | 'attempts' | 'lastError' | 'nextAttemptAt' | 'sentAt'
> & { capturedEmailId: string | null };
function serializeQueueItem(row: EmailRow) {
  return emailQueueItemSchema.parse({
    ...row,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  });
}
function offsetFor(page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset))
    throw new HttpError(400, 'INVALID_INPUT', 'Página fuera de rango');
  return offset;
}
// El contrato de formulario exige un motivo válido; el servidor distingue un motivo
// ausente/blanco (422 de negocio) de un tipo o campo desconocido (400 de esquema).
const cancelInputSchema = cancelSchema
  .omit({ reason: true })
  .extend({ reason: textSchema.optional() })
  .strict();

export class AdminService {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listBookings(value: unknown): Promise<AdminBookingPage> {
    const query = adminBookingQuerySchema.parse(value);
    const offset = offsetFor(query.page, query.pageSize);
    const filter = and(
      query.status ? eq(bookings.status, query.status) : undefined,
      query.roomId ? eq(bookings.roomId, query.roomId) : undefined,
    );
    // Total e items comparten snapshot aunque otro cliente confirme durante la consulta.
    return this.database.db.transaction(
      async (tx) => {
        const [total] = await tx.select({ value: count() }).from(bookings).where(filter);
        const rows = await tx
          .select()
          .from(bookings)
          .where(filter)
          .orderBy(desc(bookings.createdAt), desc(bookings.id))
          .limit(query.pageSize)
          .offset(offset);
        return adminBookingPageSchema.parse({
          items: rows.map(serializeBooking),
          total: total?.value ?? 0,
          page: query.page,
          pageSize: query.pageSize,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async bookingDetail(id: string): Promise<AdminBookingDetail> {
    return this.database.db.transaction(
      async (tx) => {
        const [row] = await tx.select().from(bookings).where(eq(bookings.id, id));
        if (!row) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Reserva no encontrada');
        const lines = await tx
          .select({ concept: bookingLines.concept, amountCop: bookingLines.amountCop })
          .from(bookingLines)
          .where(eq(bookingLines.bookingId, id))
          .orderBy(bookingLines.concept);
        const [email] = await tx
          .select({ event: queueColumns, capture: capturedEmails })
          .from(emailOutbox)
          .leftJoin(capturedEmails, eq(capturedEmails.bookingId, emailOutbox.bookingId))
          .where(eq(emailOutbox.bookingId, id));
        return adminBookingDetailSchema.parse({
          booking: serializeBooking(row),
          lines,
          email: email
            ? {
                ...serializeQueueItem(email.event),
                capture: email.capture
                  ? {
                      id: email.capture.id,
                      bookingId: email.capture.bookingId,
                      toEmail: email.capture.toEmail,
                      subject: email.capture.subject,
                      textBody: email.capture.textBody,
                      htmlBody: email.capture.htmlBody,
                      capturedAt: email.capture.capturedAt.toISOString(),
                    }
                  : null,
              }
            : null,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async changeStatus(id: string, action: 'cancel' | 'complete', value: unknown): Promise<Booking> {
    const input = action === 'cancel' ? cancelInputSchema.parse(value) : confirmSchema.parse(value);
    const reason =
      'reason' in input && typeof input.reason === 'string' ? input.reason.trim() : undefined;
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx.select().from(bookings).where(eq(bookings.id, id)).for('update');
      if (!row) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Reserva no encontrada');
      const now = this.now();
      const status = transition(row.status, action, {
        now,
        ...(row.endsAt ? { endsAt: row.endsAt } : {}),
        ...(reason !== undefined ? { reason } : {}),
      });
      if (row.version !== input.expectedVersion)
        throw new HttpError(
          409,
          'VERSION_CONFLICT',
          'La reserva cambió. Vuelve a cargarla antes de continuar',
        );
      const [updated] = await tx
        .update(bookings)
        .set({
          status,
          version: row.version + 1,
          updatedAt: now,
          ...(action === 'cancel' ? { cancelledAt: now, cancellationReason: reason ?? null } : {}),
        })
        .where(eq(bookings.id, id))
        .returning();
      if (!updated) throw new Error('Reserva bloqueada desapareció');
      return serializeBooking(updated);
    });
  }
}
