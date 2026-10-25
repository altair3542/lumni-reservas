import { DateTime } from 'luxon';
import {
  customerSchema,
  quoteRequestSchema,
  TIME_ZONE,
  type Booking,
  type BookingStatus,
  type QuoteRequest,
} from '@lumni/shared';
import { HttpError } from '../http/errors.js';

export type BookingAction = 'confirm' | 'complete' | 'cancel';

export function transition(
  status: BookingStatus,
  action: BookingAction,
  context: { now: Date; endsAt?: Date; reason?: string },
): BookingStatus {
  if (status === 'draft' && action === 'confirm') return 'confirmed';
  if (status === 'confirmed' && action === 'cancel') {
    const reason = context.reason?.trim();
    if (!reason || reason.length > 1000)
      throw new HttpError(
        422,
        'CANCELLATION_REASON_REQUIRED',
        'Indica un motivo de cancelación válido',
      );
    return 'cancelled';
  }
  if (status === 'confirmed' && action === 'complete') {
    if (!context.endsAt || context.endsAt.getTime() > context.now.getTime())
      throw new HttpError(409, 'BOOKING_NOT_ENDED', 'La reserva todavía no ha terminado');
    return 'completed';
  }
  throw new HttpError(409, 'INVALID_TRANSITION', 'La reserva no permite esta transición');
}

export function nextStep(
  booking: Pick<Booking, 'customer' | 'roomId' | 'startsAt' | 'endsAt'>,
): 1 | 2 | 3 {
  if (!customerSchema.safeParse(booking.customer).success) return 1;
  if (!booking.roomId || !booking.startsAt || !booking.endsAt) return 2;
  return 3;
}

export function bookingQuoteInput(booking: Booking): QuoteRequest {
  if (!booking.roomId || !booking.startsAt || !booking.endsAt)
    throw new HttpError(422, 'INCOMPLETE_DRAFT', 'Guarda la sala y el horario antes de continuar');
  const start = DateTime.fromISO(booking.startsAt).setZone(TIME_ZONE);
  const result = quoteRequestSchema.safeParse({
    roomId: booking.roomId,
    date: start.toISODate(),
    startTime: start.toFormat('HH:mm'),
    durationMinutes: (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 60000,
    serviceCodes: booking.serviceCodes ?? [],
  });
  if (!result.success)
    throw new HttpError(422, 'INVALID_DRAFT_SCHEDULE', 'Revisa el horario del borrador');
  return result.data;
}
