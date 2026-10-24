import { DateTime } from 'luxon';
import {
  durationSchema,
  moneySchema,
  quoteSchema,
  TIME_ZONE,
  type Quote,
  type QuoteRequest,
} from '@lumni/shared';

export type TimeSlot = { startsAt: Date; endsAt: Date };
export type QuoteBreakdown = Quote['breakdown'];

// Cada componente se redondea al peso, con mitades hacia arriba, sin floats monetarios.
const roundRatio = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;
export function calculateQuote({
  hourlyRateCop,
  durationMinutes,
  saturday,
  servicePricesCop = [],
}: {
  hourlyRateCop: number;
  durationMinutes: number;
  saturday: boolean;
  servicePricesCop?: readonly number[];
}): QuoteBreakdown {
  const rate = BigInt(moneySchema.positive().parse(hourlyRateCop));
  const minutes = durationSchema.parse(durationMinutes);
  const base = roundRatio(rate * BigInt(minutes), 60n);
  const discountRate = minutes >= 480 ? 20n : minutes >= 240 ? 10n : 0n;
  const discount = roundRatio(base * discountRate, 100n);
  const surcharge = saturday ? roundRatio((base - discount) * 25n, 100n) : 0n;
  const services = servicePricesCop.reduce(
    (sum, price) => sum + BigInt(moneySchema.parse(price)),
    0n,
  );
  const total = base - discount + surcharge + services;
  return {
    base: moneySchema.parse(Number(base)),
    discount: moneySchema.parse(Number(discount)),
    surcharge: moneySchema.parse(Number(surcharge)),
    services: moneySchema.parse(Number(services)),
    total: moneySchema.parse(Number(total)),
  };
}

export function isAvailable(requested: TimeSlot, occupied: readonly TimeSlot[]): boolean {
  return occupied.every(
    (slot) =>
      slot.startsAt.getTime() >= requested.endsAt.getTime() ||
      slot.endsAt.getTime() <= requested.startsAt.getTime(),
  );
}

export function requestedStart(input: Pick<QuoteRequest, 'date' | 'startTime'>) {
  const start = DateTime.fromISO(`${input.date}T${input.startTime}`, { zone: TIME_ZONE });
  if (!start.isValid) throw new Error('Horario inválido después de validar el contrato');
  return start;
}
const toIso = (date: DateTime): string => {
  const value = date.toISO({ suppressMilliseconds: true });
  if (!value) throw new Error('Instante inválido');
  return value;
};

export function suggestNextAvailable({
  startsAt,
  durationMinutes,
  occupied,
  now,
}: {
  startsAt: Date;
  durationMinutes: number;
  occupied: readonly TimeSlot[];
  now: Date;
}): TimeSlot | null {
  durationSchema.parse(durationMinutes);
  const requested = DateTime.fromJSDate(startsAt, { zone: TIME_ZONE });
  const opening = requested.startOf('day').set({ hour: 7 });
  const closing = requested.startOf('day').set({ hour: 21 });
  if (!requested.isValid || requested.weekday === 7) return null;
  // La entrada viene del contrato (:00/:30). El recorrido es acotado al mismo día.
  let candidate = requested < opening ? opening : requested;
  for (
    ;
    candidate.plus({ minutes: durationMinutes }) <= closing;
    candidate = candidate.plus({ minutes: 30 })
  ) {
    const slot = {
      startsAt: candidate.toJSDate(),
      endsAt: candidate.plus({ minutes: durationMinutes }).toJSDate(),
    };
    if (slot.startsAt.getTime() >= now.getTime() && isAvailable(slot, occupied)) return slot;
  }
  return null;
}

export function evaluateQuote({
  input,
  hourlyRateCop,
  servicePricesCop,
  occupied,
  now,
}: {
  input: QuoteRequest;
  hourlyRateCop: number;
  servicePricesCop: readonly number[];
  occupied: readonly TimeSlot[];
  now: Date;
}): Quote {
  if (!Number.isFinite(now.getTime())) throw new Error('Reloj inválido');
  const start = requestedStart(input);
  const end = start.plus({ minutes: input.durationMinutes });
  const opening = start.startOf('day').set({ hour: 7 });
  const closing = start.startOf('day').set({ hour: 21 });
  const slot = { startsAt: start.toJSDate(), endsAt: end.toJSDate() };
  let reasonCode: Quote['reasonCode'] = null;
  let message: string | null = null;
  if (slot.startsAt.getTime() < now.getTime()) {
    reasonCode = 'PAST';
    message = 'El horario solicitado ya pasó.';
  } else if (start.weekday === 7) {
    reasonCode = 'CLOSED_SUNDAY';
    message = 'El coworking está cerrado los domingos.';
  } else if (start < opening || end > closing) {
    reasonCode = 'OUTSIDE_HOURS';
    message = 'Las reservas deben quedar entre las 07:00 y las 21:00 del mismo día.';
  } else if (!isAvailable(slot, occupied)) {
    reasonCode = 'ROOM_UNAVAILABLE';
    message = 'La sala está ocupada durante el horario solicitado.';
  }
  const alternative =
    reasonCode === 'ROOM_UNAVAILABLE' || reasonCode === 'OUTSIDE_HOURS'
      ? suggestNextAvailable({
          startsAt: slot.startsAt,
          durationMinutes: input.durationMinutes,
          occupied,
          now,
        })
      : null;
  return quoteSchema.parse({
    roomId: input.roomId,
    startsAt: toIso(start),
    endsAt: toIso(end),
    timeZone: TIME_ZONE,
    currency: 'COP',
    pricingVersion: 'v1',
    breakdown: calculateQuote({
      hourlyRateCop,
      durationMinutes: input.durationMinutes,
      saturday: start.weekday === 6,
      servicePricesCop,
    }),
    canBook: reasonCode === null,
    reasonCode,
    message,
    suggestedSlot: alternative
      ? {
          startsAt: toIso(DateTime.fromJSDate(alternative.startsAt, { zone: TIME_ZONE })),
          endsAt: toIso(DateTime.fromJSDate(alternative.endsAt, { zone: TIME_ZONE })),
        }
      : null,
  });
}
