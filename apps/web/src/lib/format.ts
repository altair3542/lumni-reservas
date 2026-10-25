import { DateTime } from 'luxon';
import { TIME_ZONE, type BookingStatus, type QuoteRequest } from '@lumni/shared';
const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
export const cop = (value: number) => money.format(value);
export const local = (instant: string) =>
  DateTime.fromISO(instant).setZone(TIME_ZONE).setLocale('es-CO');
export const fullDate = (instant: string) => local(instant).toFormat("cccc d 'de' LLLL, h:mm a");
export const slotLabel = (start: string, end: string) =>
  `${local(start).toFormat('d LLL yyyy · h:mm a')} – ${local(end).toFormat('h:mm a')}`;
export const today = () => DateTime.now().setZone(TIME_ZONE).toISODate()!;
export function initialSchedule(roomId = ''): QuoteRequest {
  let day = DateTime.now().setZone(TIME_ZONE).plus({ days: 1 });
  if (day.weekday === 7) day = day.plus({ days: 1 });
  return {
    roomId,
    date: day.toISODate()!,
    startTime: '09:00',
    durationMinutes: 60,
    serviceCodes: [],
  };
}
export function scheduleFields(startsAt: string, endsAt: string) {
  return {
    date: local(startsAt).toISODate()!,
    startTime: local(startsAt).toFormat('HH:mm'),
    durationMinutes: Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000),
  };
}
export const bookingLabels: Record<BookingStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
};
export const emailLabels: Record<string, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Fallido',
};
