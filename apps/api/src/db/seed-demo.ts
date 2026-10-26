import { DateTime } from 'luxon';
import { drizzle } from 'drizzle-orm/node-postgres';
import { TIME_ZONE, type BookingStatus, type ServiceCode } from '@lumni/shared';
import { BookingService } from '../bookings/service.js';
import { transition } from '../bookings/domain.js';
import { QuoteService } from '../quotes/service.js';
import { HttpError } from '../http/errors.js';
import type { Database } from './client.js';
import { DEMO_CLIENT_ID, DEMO_ROOM_ID } from './seed.js';
import * as schema from './schema.js';

const roomIds = [
  DEMO_ROOM_ID,
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000203',
];
const statuses: BookingStatus[] = ['draft', 'confirmed', 'completed', 'cancelled'];
const durations = [60, 90, 120, 240, 480, 180];
const extras: ServiceCode[][] = [[], ['projector'], ['coffee'], ['projector', 'coffee']];
const names = [
  'Reunión de equipo',
  'Taller de producto',
  'Entrevistas',
  'Capacitación',
  'Planeación',
  'Presentación',
];

// IDs de solicitud estables: se agregan ejemplos faltantes, nunca se reescriben los existentes.
export function demoRequestId(index: number): string {
  return `00000000-0000-4000-8000-${String(501 + index).padStart(12, '0')}`;
}

export async function seedDemoBookings(database: Database, now = new Date()) {
  const today = DateTime.fromJSDate(now, { zone: TIME_ZONE }).startOf('day');
  if (!today.isValid) throw new Error('Reloj del seed inválido');
  const result = { created: 0, existing: 0, skipped: 0 };
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('lumni-demo-bookings-v1'))");
    const db = drizzle(client, { schema });
    for (let index = 0; index < 24; index++) {
      const clientRequestId = demoRequestId(index);
      const existing = await client.query(
        'SELECT id FROM bookings WHERE owner_id=$1 AND client_request_id=$2',
        [DEMO_CLIENT_ID, clientRequestId],
      );
      if (existing.rowCount) {
        result.existing++;
        continue;
      }
      const status = statuses[index % statuses.length]!;
      const historical = status === 'completed' || status === 'cancelled';
      let day = historical ? today.minus({ days: index + 2 }) : today.plus({ days: index + 2 });
      if (day.weekday === 7) day = historical ? day.minus({ days: 1 }) : day.plus({ days: 1 });
      // Las reservas históricas recorren las mismas reglas con un reloj anterior a su horario.
      const createdAt = historical
        ? day.minus({ days: 1 }).set({ hour: 12 }).toJSDate()
        : DateTime.fromJSDate(now).minus({ hours: index }).toJSDate();
      const seedClock = () => createdAt;
      const bookings = new BookingService(database, seedClock, client);
      const quotes = new QuoteService({ db }, seedClock);
      let schedule = {
        roomId: roomIds[index % roomIds.length]!,
        date: day.toISODate()!,
        startTime: '09:00',
        durationMinutes: durations[index % durations.length]!,
        serviceCodes: extras[index % extras.length]!,
      };
      if (status !== 'draft') {
        const quote = await quotes.quote(schedule);
        if (!quote.canBook) {
          if (!quote.suggestedSlot) {
            result.skipped++;
            continue;
          }
          const alternative = DateTime.fromISO(quote.suggestedSlot.startsAt).setZone(TIME_ZONE);
          schedule = {
            ...schedule,
            date: alternative.toISODate()!,
            startTime: alternative.toFormat('HH:mm'),
          };
        }
      }
      await client.query('SAVEPOINT demo_booking');
      try {
        let booking = await bookings.create(DEMO_CLIENT_ID, {
          clientRequestId,
          customer: {
            fullName: `[Demo] ${names[index % names.length]}`,
            email: 'cliente@example.com',
            company: `Equipo demo ${Math.floor(index / 4) + 1}`,
          },
        });
        // Dos borradores muestran los pasos pendientes; el resto permite revisar una cotización.
        if (index !== 0) {
          booking = await bookings.save(DEMO_CLIENT_ID, booking.id, {
            step: 2,
            expectedVersion: booking.version,
            roomId: schedule.roomId,
            date: schedule.date,
            startTime: schedule.startTime,
            durationMinutes: schedule.durationMinutes,
          });
          if (index !== 4)
            booking = await bookings.save(DEMO_CLIENT_ID, booking.id, {
              step: 3,
              expectedVersion: booking.version,
              serviceCodes: schedule.serviceCodes,
            });
        }
        if (status !== 'draft')
          booking = await bookings.confirm(DEMO_CLIENT_ID, booking.id, {
            expectedVersion: booking.version,
          });
        if (historical) {
          const action = status === 'completed' ? 'complete' : 'cancel';
          const finalAt = status === 'completed' ? new Date(booking.endsAt!) : createdAt;
          const reason = '[Demo] El equipo cambió la fecha de su actividad';
          const finalStatus = transition(booking.status, action, {
            now: finalAt,
            endsAt: new Date(booking.endsAt!),
            reason,
          });
          await client.query(
            'UPDATE bookings SET status=$2, version=version+1, updated_at=$3, cancelled_at=$4, cancellation_reason=$5 WHERE id=$1',
            [
              booking.id,
              finalStatus,
              finalAt,
              status === 'cancelled' ? finalAt : null,
              status === 'cancelled' ? reason : null,
            ],
          );
        }
        await client.query('UPDATE bookings SET created_at=$2, updated_at=$3 WHERE id=$1', [
          booking.id,
          createdAt,
          status === 'completed' ? new Date(booking.endsAt!) : createdAt,
        ]);
        await client.query('RELEASE SAVEPOINT demo_booking');
        result.created++;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT demo_booking');
        if (!(error instanceof HttpError) || error.code !== 'ROOM_UNAVAILABLE') throw error;
        await client.query('RELEASE SAVEPOINT demo_booking');
        result.skipped++;
      }
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
