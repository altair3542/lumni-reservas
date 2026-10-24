import { and, eq, inArray, sql } from 'drizzle-orm';
import { quoteRequestSchema, type Quote } from '@lumni/shared';
import type { Database } from '../db/client.js';
import { bookings, rooms, services } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { evaluateQuote, requestedStart, type TimeSlot } from './domain.js';

export class QuoteService {
  constructor(
    private readonly database: Database,
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
    const occupied: TimeSlot[] = rows.map((row) => {
      if (!row.startsAt || !row.endsAt) throw new Error('Reserva ocupante sin intervalo completo');
      return { startsAt: row.startsAt, endsAt: row.endsAt };
    });
    return evaluateQuote({
      input,
      hourlyRateCop: room.hourlyRateCop,
      servicePricesCop: selectedServices.map((service) => service.price),
      occupied,
      now,
    });
  }
}
