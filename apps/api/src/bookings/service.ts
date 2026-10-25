import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import {
  bookingSchema,
  confirmSchema,
  createDraftSchema,
  customerSchema,
  draftStepSchema,
  emailPayloadSchema,
  quoteSchema,
  type Booking,
  type BookingStatus,
} from '@lumni/shared';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { requestedStart, scheduleIssue } from '../quotes/domain.js';
import { QuoteService } from '../quotes/service.js';
import { bookingQuoteInput, nextStep, transition } from './domain.js';

type BookingRow = typeof schema.bookings.$inferSelect;

// Expone solo el contrato público; el hash de idempotencia nunca sale de la API.
function serialize(row: BookingRow): Booking {
  return bookingSchema.parse({
    id: row.id,
    ownerId: row.ownerId,
    status: row.status,
    wizardStep: row.wizardStep,
    version: row.version,
    customer: row.customer,
    roomId: row.roomId,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    serviceCodes: row.serviceCodes,
    quoteSnapshot: row.quoteSnapshot,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
  });
}

function assertVersion(booking: Booking, expectedVersion: number) {
  if (booking.version !== expectedVersion)
    throw new HttpError(
      409,
      'VERSION_CONFLICT',
      'El borrador cambió. Vuelve a cargarlo antes de guardar',
    );
}

export class BookingService {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async locked(client: PoolClient, ownerId: string, id: string) {
    const [row] = await drizzle(client, { schema })
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, id), eq(schema.bookings.ownerId, ownerId)))
      .for('update');
    if (!row) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Reserva no encontrada');
    return serialize(row);
  }

  async create(ownerId: string, value: unknown): Promise<Booking> {
    const input = createDraftSchema.parse(value);
    // Orden y valores normalizados, independiente del orden de propiedades del JSON entrante.
    const customer = input.customer ?? {};
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          fullName: customer.fullName ?? null,
          email: customer.email ?? null,
          company: customer.company ?? null,
        }),
      )
      .digest('hex');
    return this.transaction(async (client) => {
      const db = drizzle(client, { schema });
      const [created] = await db
        .insert(schema.bookings)
        .values({
          ownerId,
          clientRequestId: input.clientRequestId,
          createRequestHash: hash,
          customer: input.customer
            ? {
                ...(customer.fullName !== undefined ? { fullName: customer.fullName } : {}),
                ...(customer.email !== undefined ? { email: customer.email } : {}),
                ...(customer.company !== undefined ? { company: customer.company } : {}),
              }
            : null,
          wizardStep: nextStep({ customer, roomId: null, startsAt: null, endsAt: null }),
        })
        .onConflictDoNothing({ target: [schema.bookings.ownerId, schema.bookings.clientRequestId] })
        .returning();
      if (created) return serialize(created);
      const [existing] = await db
        .select()
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.ownerId, ownerId),
            eq(schema.bookings.clientRequestId, input.clientRequestId),
          ),
        );
      if (!existing || existing.createRequestHash !== hash)
        throw new HttpError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'El identificador de creación ya se usó con otros datos',
        );
      return serialize(existing);
    });
  }

  async get(ownerId: string, id: string): Promise<Booking> {
    const [row] = await this.database.db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, id), eq(schema.bookings.ownerId, ownerId)));
    if (!row) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Reserva no encontrada');
    return serialize(row);
  }

  async list(ownerId: string, status?: BookingStatus): Promise<Booking[]> {
    const rows = await this.database.db
      .select()
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.ownerId, ownerId),
          status ? eq(schema.bookings.status, status) : undefined,
        ),
      )
      .orderBy(desc(schema.bookings.createdAt), desc(schema.bookings.id));
    return rows.map(serialize);
  }

  async save(ownerId: string, id: string, value: unknown): Promise<Booking> {
    const input = draftStepSchema.parse(value);
    return this.transaction(async (client) => {
      const booking = await this.locked(client, ownerId, id);
      if (booking.status !== 'draft')
        throw new HttpError(409, 'INVALID_TRANSITION', 'Solo puedes editar un borrador');
      assertVersion(booking, input.expectedVersion);
      const db = drizzle(client, { schema });
      const values: Partial<typeof schema.bookings.$inferInsert> = {
        version: booking.version + 1,
        updatedAt: this.now(),
      };
      if (input.step === 1) {
        values.customer = input.customer;
        values.wizardStep = nextStep({ ...booking, customer: input.customer });
      } else if (input.step === 2) {
        const start = requestedStart(input);
        const [room] = await db
          .select({ id: schema.rooms.id })
          .from(schema.rooms)
          .where(eq(schema.rooms.id, input.roomId));
        if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'La sala solicitada no existe');
        const issue = scheduleIssue({ ...input, serviceCodes: [] }, this.now());
        if (issue) throw new HttpError(422, issue.code, issue.message);
        values.roomId = input.roomId;
        values.startsAt = start.toJSDate();
        values.endsAt = start.plus({ minutes: input.durationMinutes }).toJSDate();
        // La selección cambia: se exige revisar extras/precio antes de confirmar.
        values.quoteSnapshot = null;
        values.wizardStep = nextStep({
          ...booking,
          roomId: input.roomId,
          startsAt: start.toISO(),
          endsAt: values.endsAt.toISOString(),
        });
      } else {
        if (!customerSchema.safeParse(booking.customer).success)
          throw new HttpError(
            422,
            'INCOMPLETE_DRAFT',
            'Completa los datos de contacto antes de continuar',
          );
        const quote = await new QuoteService({ db }, this.now).quote({
          ...bookingQuoteInput(booking),
          serviceCodes: input.serviceCodes,
        });
        values.serviceCodes = input.serviceCodes;
        values.quoteSnapshot = quote;
        values.wizardStep = 3;
      }
      const [updated] = await db
        .update(schema.bookings)
        .set(values)
        .where(eq(schema.bookings.id, id))
        .returning();
      if (!updated) throw new Error('Borrador bloqueado desapareció');
      return serialize(updated);
    });
  }

  async confirm(ownerId: string, id: string, value: unknown): Promise<Booking> {
    const input = confirmSchema.parse(value);
    let conflictInput: ReturnType<typeof bookingQuoteInput> | undefined;
    try {
      return await this.transaction(async (client) => {
        const booking = await this.locked(client, ownerId, id);
        // Reintento tras perder respuesta: no verificar versión ni recalcular precio.
        if (booking.status === 'confirmed') return booking;
        const now = this.now();
        transition(booking.status, 'confirm', { now });
        assertVersion(booking, input.expectedVersion);
        const customer = customerSchema.safeParse(booking.customer);
        if (!customer.success || !booking.quoteSnapshot || booking.serviceCodes === null)
          throw new HttpError(
            422,
            'INCOMPLETE_DRAFT',
            'Completa los tres pasos y revisa el precio antes de confirmar',
          );
        const schedule = bookingQuoteInput(booking);
        const issue = scheduleIssue(schedule, now);
        if (issue) throw new HttpError(422, issue.code, issue.message);
        const quote = quoteSchema.parse(booking.quoteSnapshot);
        if (
          quote.roomId !== booking.roomId ||
          Date.parse(quote.startsAt) !== Date.parse(booking.startsAt!) ||
          Date.parse(quote.endsAt) !== Date.parse(booking.endsAt!)
        )
          throw new HttpError(
            422,
            'STALE_QUOTE',
            'Guarda los extras para actualizar el precio de este horario',
          );
        conflictInput = schedule;
        const db = drizzle(client, { schema });
        const [updated] = await db
          .update(schema.bookings)
          .set({
            status: 'confirmed',
            confirmedAt: now,
            updatedAt: now,
            version: booking.version + 1,
          })
          .where(eq(schema.bookings.id, id))
          .returning();
        if (!updated) throw new Error('Borrador bloqueado desapareció');
        const amounts = quote.breakdown;
        const lines = [
          { concept: 'base', amountCop: amounts.base },
          { concept: 'discount', amountCop: -amounts.discount },
          { concept: 'surcharge', amountCop: amounts.surcharge },
          { concept: 'services', amountCop: amounts.services },
        ];
        if (lines.reduce((total, line) => total + line.amountCop, 0) !== amounts.total)
          throw new Error('Líneas inconsistentes con el precio pactado');
        await db
          .insert(schema.bookingLines)
          .values(lines.map((line) => ({ ...line, bookingId: id })));
        const payload = emailPayloadSchema.parse({
          toEmail: customer.data.email,
          subject: `Reserva confirmada ${id}`,
          textBody: [
            `Hola ${customer.data.fullName}, tu reserva está confirmada.`,
            `Reserva: ${id}`,
            `Sala: ${booking.roomId}`,
            `Inicio: ${quote.startsAt}`,
            `Fin: ${quote.endsAt}`,
            `Zona: ${quote.timeZone}`,
            `Servicios: ${booking.serviceCodes.join(', ') || 'ninguno'}`,
            `Total: ${amounts.total} COP`,
          ].join('\n'),
        });
        await db.insert(schema.emailOutbox).values({
          bookingId: id,
          dedupKey: `booking-confirmed:${id}`,
          payload,
          nextAttemptAt: now,
        });
        return serialize(updated);
      });
    } catch (error) {
      // Drizzle envuelve la excepción original de pg. La sugerencia se calcula tras ROLLBACK.
      const cause = error instanceof Error && error.cause ? error.cause : error;
      if (
        cause &&
        typeof cause === 'object' &&
        'code' in cause &&
        cause.code === '23P01' &&
        conflictInput
      ) {
        const suggestedSlot = await new QuoteService(this.database, this.now).suggestSlot(
          conflictInput,
        );
        throw new HttpError(
          409,
          'ROOM_UNAVAILABLE',
          'Otra reserva ocupó el horario. Revisa la alternativa disponible',
          suggestedSlot,
        );
      }
      throw error;
    }
  }
}
