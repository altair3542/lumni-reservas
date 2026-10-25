import { afterEach, expect, it, vi } from 'vitest';
import { initialSchedule, scheduleFields, slotLabel } from './format.js';
afterEach(() => vi.useRealTimers());
it('UTC y offsets equivalentes siempre se presentan en Colombia', () => {
  expect(scheduleFields('2026-10-26T14:00:00Z', '2026-10-26T18:00:00Z')).toEqual({
    date: '2026-10-26',
    startTime: '09:00',
    durationMinutes: 240,
  });
  expect(slotLabel('2026-10-26T14:00:00Z', '2026-10-26T18:00:00Z')).toBe(
    slotLabel('2026-10-26T09:00:00-05:00', '2026-10-26T13:00:00-05:00'),
  );
});
it('fecha inicial futura salta domingo usando el día de Colombia', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T00:30:00Z'));
  expect(initialSchedule().date).toBe('2026-10-26');
});
