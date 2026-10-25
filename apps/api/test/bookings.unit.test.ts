import { describe, expect, it } from 'vitest';
import type { BookingStatus } from '@lumni/shared';
import { transition, type BookingAction } from '../src/bookings/domain.js';

const now = new Date('2026-10-26T18:00:00Z');
describe('Transiciones de reserva', () => {
  const states: BookingStatus[] = ['draft', 'confirmed', 'completed', 'cancelled'];
  const actions: BookingAction[] = ['confirm', 'complete', 'cancel'];
  const allowed: Record<string, BookingStatus> = {
    'draft:confirm': 'confirmed',
    'confirmed:complete': 'completed',
    'confirmed:cancel': 'cancelled',
  };
  for (const status of states)
    for (const action of actions) {
      it(`${status} / ${action}`, () => {
        const operation = () =>
          transition(status, action, { now, endsAt: now, reason: 'Cambio de planes' });
        const expected = allowed[`${status}:${action}`];
        if (expected) expect(operation()).toBe(expected);
        else
          expect(operation).toThrowError(
            expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' }),
          );
      });
    }
  it.each([undefined, '', '   ', 'a'.repeat(1001)])(
    'cancelar exige motivo válido: %s',
    (reason) => {
      expect(() =>
        transition('confirmed', 'cancel', { now, ...(reason !== undefined ? { reason } : {}) }),
      ).toThrowError(expect.objectContaining({ status: 422 }));
    },
  );
  it('completar exige fin alcanzado, incluido el instante exacto', () => {
    expect(() =>
      transition('confirmed', 'complete', { now, endsAt: new Date(now.getTime() + 1) }),
    ).toThrowError(expect.objectContaining({ code: 'BOOKING_NOT_ENDED' }));
    expect(() => transition('confirmed', 'complete', { now })).toThrow();
    expect(transition('confirmed', 'complete', { now, endsAt: now })).toBe('completed');
  });
});
