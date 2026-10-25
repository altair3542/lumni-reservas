import { HttpError } from '../http/errors.js';

// La comprobación usa al dueño de la sesión y conserva el mismo 404 que una reserva inexistente.
export function requireOwner<T extends { ownerId: string }>(
  ownerId: string,
  booking: T | undefined,
): asserts booking is T {
  if (!booking || booking.ownerId !== ownerId)
    throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Reserva no encontrada');
}
