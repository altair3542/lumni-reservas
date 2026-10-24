import { describe, expect, it } from 'vitest';
import { quoteRequestSchema, quoteSchema } from '@lumni/shared';
import {
  calculateQuote,
  evaluateQuote,
  isAvailable,
  suggestNextAvailable,
  type TimeSlot,
} from '../src/quotes/domain.js';
const roomId = '00000000-0000-4000-8000-000000000201';
const now = new Date('2026-10-23T17:00:00Z');
const slot = (start: string, end: string): TimeSlot => ({
  startsAt: new Date(`2026-10-26T${start}:00-05:00`),
  endsAt: new Date(`2026-10-26T${end}:00-05:00`),
});
function quote(patch: Record<string, unknown> = {}, occupied: TimeSlot[] = [], clock = now) {
  return evaluateQuote({
    input: quoteRequestSchema.parse({
      roomId,
      date: '2026-10-26',
      startTime: '09:00',
      durationMinutes: 60,
      ...patch,
    }),
    hourlyRateCop: 40000,
    servicePricesCop: [],
    occupied,
    now: clock,
  });
}

describe('Q01/Q02/Q06/Q07/Q11 — aritmética independiente en COP', () => {
  it.each([
    [40000, 60, 40000],
    [70000, 60, 70000],
    [120000, 60, 120000],
    [40000, 90, 60000],
    [120000, 210, 420000],
    [40000, 120, 80000],
  ])('tarifa %i por %i minutos da %i', (hourlyRateCop, durationMinutes, total) => {
    expect(calculateQuote({ hourlyRateCop, durationMinutes, saturday: false })).toEqual({
      base: total,
      discount: 0,
      surcharge: 0,
      services: 0,
      total,
    });
  });
  it.each([
    [210, 140000, 0, 140000],
    [240, 160000, 16000, 144000],
    [450, 300000, 30000, 270000],
    [480, 320000, 64000, 256000],
    [600, 400000, 80000, 320000],
  ])('frontera %i minutos', (durationMinutes, base, discount, total) => {
    expect(calculateQuote({ hourlyRateCop: 40000, durationMinutes, saturday: false })).toEqual({
      base,
      discount,
      surcharge: 0,
      services: 0,
      total,
    });
  });
  it('mediana martes 4h: descuento no acumulado', () => {
    expect(calculateQuote({ hourlyRateCop: 70000, durationMinutes: 240, saturday: false })).toEqual(
      { base: 280000, discount: 28000, surcharge: 0, services: 0, total: 252000 },
    );
  });
  it.each([
    [40000, 240, 160000, 16000, 36000, 180000],
    [70000, 480, 560000, 112000, 112000, 560000],
    [120000, 480, 960000, 192000, 192000, 960000],
  ])(
    'sábado %i/h, %i min: recargo sobre precio descontado',
    (hourlyRateCop, durationMinutes, base, discount, surcharge, total) => {
      expect(calculateQuote({ hourlyRateCop, durationMinutes, saturday: true })).toEqual({
        base,
        discount,
        surcharge,
        services: 0,
        total,
      });
    },
  );
  it('extras se suman al final sin descuento ni recargo', () => {
    expect(
      calculateQuote({
        hourlyRateCop: 40000,
        durationMinutes: 240,
        saturday: true,
        servicePricesCop: [20000, 10000],
      }),
    ).toEqual({ base: 160000, discount: 16000, surcharge: 36000, services: 30000, total: 210000 });
  });
  it('redondea componentes al peso sin precisión flotante', () => {
    expect(
      calculateQuote({ hourlyRateCop: 40001, durationMinutes: 90, saturday: false }).base,
    ).toBe(60002);
    expect(calculateQuote({ hourlyRateCop: 40001, durationMinutes: 240, saturday: true })).toEqual({
      base: 160004,
      discount: 16000,
      surcharge: 36001,
      services: 0,
      total: 180005,
    });
    expect(() =>
      calculateQuote({
        hourlyRateCop: 40000,
        durationMinutes: 60,
        saturday: false,
        servicePricesCop: [1.5],
      }),
    ).toThrow();
  });
});

describe('Q03/Q04/Q05 — validación y calendario Bogotá', () => {
  it.each([0, 30, 59, 61, 601, 630, 90.5])('rechaza duración %s', (durationMinutes) => {
    expect(() =>
      calculateQuote({ hourlyRateCop: 40000, durationMinutes, saturday: false }),
    ).toThrow();
  });
  it.each([60, 600])('admite duración límite %i', (durationMinutes) =>
    expect(quote({ startTime: '07:00', durationMinutes }).canBook).toBe(true),
  );
  it.each(['2026-10-24', '2026-10-26'])(
    'abre 07:00 y permite terminar exactamente 21:00 en %s',
    (date) => {
      expect(quote({ date, startTime: '07:00' }).canBook).toBe(true);
      expect(quote({ date, startTime: '20:00' }).canBook).toBe(true);
    },
  );
  it('antes de apertura sugiere 07:00; después de cierre nunca cambia de día', () => {
    const early = quote({ startTime: '06:30' });
    expect(early.canBook).toBe(false);
    expect(early.reasonCode).toBe('OUTSIDE_HOURS');
    expect(early.suggestedSlot).toEqual({
      startsAt: '2026-10-26T07:00:00-05:00',
      endsAt: '2026-10-26T08:00:00-05:00',
    });
    expect(quote({ startTime: '20:30' })).toMatchObject({
      canBook: false,
      reasonCode: 'OUTSIDE_HOURS',
      suggestedSlot: null,
    });
    expect(quote({ startTime: '23:30', durationMinutes: 600 }).suggestedSlot).toBeNull();
  });
  it('domingo, fecha pasada y hora pasada no tienen alternativa', () => {
    expect(quote({ date: '2026-10-25' })).toMatchObject({
      canBook: false,
      reasonCode: 'CLOSED_SUNDAY',
      suggestedSlot: null,
    });
    expect(quote({ date: '2026-10-22' })).toMatchObject({
      canBook: false,
      reasonCode: 'PAST',
      suggestedSlot: null,
    });
    expect(quote({ date: '2026-10-23', startTime: '11:30' })).toMatchObject({
      canBook: false,
      reasonCode: 'PAST',
      suggestedSlot: null,
    });
    expect(quote({ date: '2026-10-23', startTime: '12:00' }).canBook).toBe(true);
  });
  it('fecha imposible, string numérico y hora fuera de rejilla no pasan el contrato', () => {
    for (const value of [{ date: '2026-02-30' }, { durationMinutes: '60' }, { startTime: '09:15' }])
      expect(() => quote(value)).toThrow();
  });
});

describe('Q08/Q09/Q10/Q12/Q13 — intervalos, alternativas y zona', () => {
  it('respeta extremos semiabiertos, solapamientos parciales y contención', () => {
    const occupied = [slot('09:00', '10:30')];
    expect(isAvailable(slot('08:00', '09:00'), occupied)).toBe(true);
    expect(isAvailable(slot('10:30', '11:30'), occupied)).toBe(true);
    for (const requested of [
      slot('08:30', '09:30'),
      slot('10:00', '11:00'),
      slot('09:30', '10:00'),
      slot('08:00', '11:00'),
    ])
      expect(isAvailable(requested, occupied)).toBe(false);
  });
  it('cadena contigua: 09:00 por 1h sugiere 12:00–13:00', () => {
    const result = quote({}, [slot('09:00', '10:30'), slot('10:30', '12:00')]);
    expect(result).toMatchObject({
      canBook: false,
      reasonCode: 'ROOM_UNAVAILABLE',
      suggestedSlot: { startsAt: '2026-10-26T12:00:00-05:00', endsAt: '2026-10-26T13:00:00-05:00' },
    });
    expect(result.message).toBeTruthy();
    expect(quoteSchema.safeParse(result).success).toBe(true);
  });
  it('no ofrece el día siguiente cuando el resto del día está ocupado', () => {
    expect(quote({}, [slot('09:00', '21:00')]).suggestedSlot).toBeNull();
  });
  it('no recorta las 10h pedidas para encajarlas ni entra en bucle', () => {
    expect(
      quote({ startTime: '07:00', durationMinutes: 600 }, [
        slot('07:00', '08:00'),
        slot('16:00', '17:00'),
      ]),
    ).toMatchObject({ canBook: false, suggestedSlot: null });
  });
  it('nunca sugiere un instante pasado, aun al llamar al buscador directamente', () => {
    const result = suggestNextAvailable({
      startsAt: slot('07:00', '08:00').startsAt,
      durationMinutes: 60,
      occupied: [],
      now: new Date('2026-10-26T09:05:00-05:00'),
    });
    expect(result).toEqual(slot('09:30', '10:30'));
  });
  it('mismo resultado en TZ UTC y Pacific/Auckland', () => {
    const previous = process.env.TZ;
    try {
      const results = ['UTC', 'Pacific/Auckland'].map((zone) => {
        process.env.TZ = zone;
        return evaluateQuote({
          input: quoteRequestSchema.parse({
            roomId,
            date: '2026-10-24',
            startTime: '09:00',
            durationMinutes: 240,
            serviceCodes: ['projector', 'coffee'],
          }),
          hourlyRateCop: 40000,
          servicePricesCop: [20000, 10000],
          occupied: [],
          now,
        });
      });
      expect(results[0]).toEqual(results[1]);
      expect(results[0]).toMatchObject({
        startsAt: '2026-10-24T09:00:00-05:00',
        breakdown: { total: 210000 },
      });
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
