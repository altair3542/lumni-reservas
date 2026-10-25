import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { type Booking, type Quote } from '@lumni/shared';
import { bookingLabels, cop, fullDate, slotLabel } from '../lib/format.js';
import { ApiError } from '../api.js';
export function Notice({
  children,
  kind = 'info',
}: {
  children: ReactNode;
  kind?: 'info' | 'error' | 'success';
}) {
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Notice kind="error">
      {error instanceof Error ? error.message : 'No pudimos completar esta acción.'}
      {error instanceof ApiError && error.status === 409 && error.code === 'VERSION_CONFLICT' && (
        <p>Hay cambios más recientes. Carga la versión guardada antes de continuar.</p>
      )}
    </Notice>
  );
}
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function Badge({ status }: { status: Booking['status'] }) {
  return <span className={`badge ${status}`}>{bookingLabels[status]}</span>;
}
export function Breakdown({ quote }: { quote: Quote }) {
  const b = quote.breakdown;
  return (
    <dl className="breakdown">
      <div>
        <dt>Valor de la sala</dt>
        <dd>{cop(b.base)}</dd>
      </div>
      <div>
        <dt>Descuento por duración</dt>
        <dd>{b.discount ? `−${cop(b.discount)}` : cop(0)}</dd>
      </div>
      <div>
        <dt>Recargo del sábado</dt>
        <dd>{cop(b.surcharge)}</dd>
      </div>
      <div>
        <dt>Servicios adicionales</dt>
        <dd>{cop(b.services)}</dd>
      </div>
      <div className="total">
        <dt>Total</dt>
        <dd>
          {cop(b.total)}
          <small>COP</small>
        </dd>
      </div>
    </dl>
  );
}
export function Availability({
  quote,
  onAlternative,
}: {
  quote: Pick<Quote, 'canBook' | 'message' | 'suggestedSlot'>;
  onAlternative?: (slot: NonNullable<Quote['suggestedSlot']>) => void;
}) {
  if (quote.canBook)
    return <Notice kind="success">Horario disponible. El espacio se reserva al confirmar.</Notice>;
  return (
    <Notice kind="error">
      <p>{quote.message}</p>
      {quote.suggestedSlot && (
        <div className="alternative">
          <strong>Otra opción para ti</strong>
          <span>{slotLabel(quote.suggestedSlot.startsAt, quote.suggestedSlot.endsAt)}</span>
          {onAlternative && (
            <button
              type="button"
              className="button secondary"
              onClick={() => onAlternative(quote.suggestedSlot!)}
            >
              Revisar este horario →
            </button>
          )}
        </div>
      )}
    </Notice>
  );
}
export function BookingSummary({
  booking,
  roomName,
}: {
  booking: Booking;
  roomName?: string | undefined;
}) {
  return (
    <section className="card summary">
      <div className="row between">
        <span className="eyebrow">TU RESERVA</span>
        <Badge status={booking.status} />
      </div>
      <h2>{roomName ?? 'Espacio por elegir'}</h2>
      <dl className="details">
        <div>
          <dt>Horario en Colombia</dt>
          <dd>
            {booking.startsAt && booking.endsAt
              ? slotLabel(booking.startsAt, booking.endsAt)
              : 'Por completar'}
          </dd>
        </div>
        <div>
          <dt>Contacto</dt>
          <dd>
            {booking.customer?.fullName ?? 'Por completar'}
            <small>{booking.customer?.email}</small>
            {booking.customer?.company && <small>{booking.customer.company}</small>}
          </dd>
        </div>
        <div>
          <dt>Servicios</dt>
          <dd>
            {booking.serviceCodes === null
              ? 'Por elegir'
              : booking.serviceCodes
                  .map((code) => (code === 'coffee' ? 'Café' : 'Proyector'))
                  .join(' · ') || 'Sin adicionales'}
          </dd>
        </div>
      </dl>
      {booking.quoteSnapshot ? (
        <Breakdown quote={booking.quoteSnapshot} />
      ) : (
        <p className="muted">El precio se calcula al guardar los servicios.</p>
      )}
      {booking.confirmedAt && (
        <p className="muted">Confirmada el {fullDate(booking.confirmedAt)}</p>
      )}
      {booking.cancellationReason && (
        <Notice>Motivo de cancelación: {booking.cancellationReason}</Notice>
      )}
      <p className="reference">Referencia {booking.id}</p>
    </section>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span aria-hidden="true">◷</span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="back-link" to={to}>
      ← {children}
    </Link>
  );
}
