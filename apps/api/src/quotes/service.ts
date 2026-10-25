import { DateTime } from 'luxon';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { quoteRequestSchema, TIME_ZONE, type Quote, type QuoteRequest } from '@lumni/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { bookings, rooms, services } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import {
  evaluateQuote,
  requestedStart,
  scheduleIssue,
  suggestNextAvailable,
  type TimeSlot,
} from './domain.js';

export class QuoteService {
  constructor(
    private readonly database: { db: NodePgDatabase<typeof schema> },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async quote(value: unknown): Promise<Quote> {
    const input = quoteRequestSchema.parse(value);
    const now = this.now();
    const [room] = await this.database.db
      .select({ hourlyRateCop: rooms.hourlyRateCop })
      .from(rooms)
      .where(eq(rooms.id, input.roomId))
      .limit(1);
    if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'La sala solicitada no existe');
    const selectedServices = input.serviceCodes.length
      ? await this.database.db
          .select({ code: services.code, price: services.flatPriceCop })
          .from(services)
          .where(inArray(services.code, input.serviceCodes))
      : [];
    if (selectedServices.length !== input.serviceCodes.length)
      throw new HttpError(
        422,
        'SERVICE_UNAVAILABLE',
        'Un servicio solicitado no está disponible en el catálogo',
      );

    const occupied = await this.occupied(input);
    return evaluateQuote({
      input,
      hourlyRateCop: room.hourlyRateCop,
      servicePricesCop: selectedServices.map((service) => service.price),
      occupied,
      now,
    });
  }

  // Tras una colisión, la alternativa solo depende de horarios: el catálogo pudo cambiar
  // desde el snapshot y no debe impedir devolver el conflicto ni recalcular su precio.
  async suggestSlot(input: QuoteRequest): Promise<Quote['suggestedSlot']> {
    const now = this.now();
    const issue = scheduleIssue(input, now);
    if (issue?.code === 'PAST' || issue?.code === 'CLOSED_SUNDAY') return null;
    const slot = suggestNextAvailable({
      startsAt: requestedStart(input).toJSDate(),
      durationMinutes: input.durationMinutes,
      occupied: await this.occupied(input),
      now,
    });
    return slot
      ? {
          startsAt: DateTime.fromJSDate(slot.startsAt, { zone: TIME_ZONE }).toISO({
            suppressMilliseconds: true,
          })!,
          endsAt: DateTime.fromJSDate(slot.endsAt, { zone: TIME_ZONE }).toISO({
            suppressMilliseconds: true,
          })!,
        }
      : null;
  }

  private async occupied(input: QuoteRequest): Promise<TimeSlot[]> {
    const day = requestedStart(input).startOf('day');
    // Leer todo el día permite sugerir un hueco real después de cadenas de reservas.
    // SELECT parametrizado, sin bloqueos de filas ni escrituras: cotizar no bloquea cupo.
    const rows = await this.database.db
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.roomId, input.roomId),
          inArray(bookings.status, ['confirmed', 'completed']),
          sql`tstzrange(${bookings.startsAt}, ${bookings.endsAt}, '[)') && tstzrange(${day.toJSDate()}::timestamptz, ${day.plus({ days: 1 }).toJSDate()}::timestamptz, '[)')`,
        ),
      );
    return rows.map((row) => {
      if (!row.startsAt || !row.endsAt) throw new Error('Reserva ocupante sin intervalo completo');
      return { startsAt: row.startsAt, endsAt: row.endsAt };
    });
  }
}
