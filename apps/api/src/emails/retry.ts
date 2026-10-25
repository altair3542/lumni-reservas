export const MAX_ATTEMPTS = 6;
const RETRY_MINUTES = [1, 2, 4, 8, 16] as const;

export function nextAttemptAt(attempts: number, now: Date): Date | null {
  if (
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    attempts > MAX_ATTEMPTS ||
    !Number.isFinite(now.getTime())
  )
    throw new Error('Intento o reloj inválido');
  const minutes = RETRY_MINUTES[attempts - 1];
  return minutes === undefined ? null : new Date(now.getTime() + minutes * 60000);
}
