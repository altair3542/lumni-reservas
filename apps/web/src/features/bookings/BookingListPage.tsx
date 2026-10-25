import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/data.js';
import { cop, slotLabel } from '../../lib/format.js';
import { Badge, Empty, ErrorNotice, Loading, PageHeading } from '../../components/Feedback.js';
export function BookingListPage() {
  const bookings = useQuery({ queryKey: ['bookings'], queryFn: api.bookings, staleTime: 0 });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: api.rooms });
  return (
    <>
      <PageHeading eyebrow="TU AGENDA" title="Encuentros por venir.">
        <Link to="/salas" className="button compact">
          + Nueva reserva
        </Link>
      </PageHeading>
      <div className="row between section-bar">
        <p className="muted">Retoma un borrador o consulta los detalles de tus reservas.</p>
        <button
          className="text-button"
          disabled={bookings.isFetching}
          onClick={() => {
            void bookings.refetch();
          }}
        >
          Actualizar
        </button>
      </div>
      <ErrorNotice error={bookings.error} />
      {bookings.isPending ? (
        <Loading />
      ) : bookings.data?.items.length ? (
        <div className="booking-grid">
          {bookings.data.items.map((booking) => (
            <article className="card booking-card" key={booking.id}>
              <div className="row between">
                <Badge status={booking.status} />
                <span className="muted">{booking.id.slice(0, 8)}</span>
              </div>
              <h2>
                {rooms.data?.items.find((room) => room.id === booking.roomId)?.name ??
                  'Espacio por elegir'}
              </h2>
              <p className="muted">
                {booking.startsAt && booking.endsAt
                  ? slotLabel(booking.startsAt, booking.endsAt)
                  : 'Horario por definir'}
              </p>
              <div className="row between booking-card-bottom">
                <strong>
                  {booking.quoteSnapshot
                    ? cop(booking.quoteSnapshot.breakdown.total)
                    : 'Por completar'}
                </strong>
                <Link to={`/reservas/${booking.id}`} className="inline-link">
                  {booking.status === 'draft' ? 'Retomar borrador →' : 'Ver reserva →'}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        bookings.data && (
          <section className="card">
            <Empty title="Tu próxima reunión empieza aquí">
              <p className="muted">
                Todavía no tienes reservas. Encuentra un espacio para tu equipo.
              </p>
              <Link to="/salas" className="button compact">
                Explorar salas →
              </Link>
            </Empty>
          </section>
        )
      )}
    </>
  );
}
