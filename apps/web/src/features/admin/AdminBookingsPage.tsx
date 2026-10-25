import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { adminBookingQuerySchema, bookingStatusSchema } from '@lumni/shared';
import { api } from '../../lib/data.js';
import { bookingLabels, cop, slotLabel } from '../../lib/format.js';
import {
  Badge,
  Empty,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
} from '../../components/Feedback.js';
export function Pagination({
  page,
  pageSize,
  total,
  busy,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total} {total === 1 ? 'resultado' : 'resultados'} · Página {page} de{' '}
        {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <div className="row">
        <button
          type="button"
          className="button secondary compact"
          disabled={page <= 1 || busy}
          onClick={() => onPage(page - 1)}
        >
          ← Anterior
        </button>
        <button
          type="button"
          className="button secondary compact"
          disabled={page * pageSize >= total || busy}
          onClick={() => onPage(page + 1)}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
export function AdminBookingsPage() {
  const [search, setSearch] = useSearchParams();
  const parsed = adminBookingQuerySchema.safeParse(Object.fromEntries(search));
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: api.rooms });
  const bookings = useQuery({
    queryKey: ['admin-bookings', search.toString()],
    queryFn: () => api.adminBookings(search.toString()),
    enabled: parsed.success,
  });
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    setSearch(next);
  };
  return (
    <>
      <PageHeading eyebrow="ADMINISTRACIÓN" title="Cada encuentro, en orden.">
        <button
          className="button secondary compact"
          disabled={bookings.isFetching}
          onClick={() => {
            void bookings.refetch();
          }}
        >
          Actualizar
        </button>
      </PageHeading>
      <section className="card table-card">
        <div className="filters">
          <label>
            Estado
            <select
              aria-label="Filtrar por estado"
              value={search.get('status') ?? ''}
              onChange={(event) => filter('status', event.target.value)}
            >
              <option value="">Todos los estados</option>
              {bookingStatusSchema.options.map((status) => (
                <option value={status} key={status}>
                  {bookingLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sala
            <select
              aria-label="Filtrar por sala"
              value={search.get('roomId') ?? ''}
              onChange={(event) => filter('roomId', event.target.value)}
            >
              <option value="">Todas las salas</option>
              {rooms.data?.items.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Por página
            <select
              aria-label="Reservas por página"
              value={search.get('pageSize') ?? '20'}
              onChange={(event) => filter('pageSize', event.target.value)}
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
        {!parsed.success ? (
          <Notice kind="error">
            Los filtros no son válidos.{' '}
            <button className="text-button" onClick={() => setSearch({})}>
              Restablecer filtros
            </button>
          </Notice>
        ) : (
          <>
            <ErrorNotice error={bookings.error ?? rooms.error} />
            {bookings.isPending ? (
              <Loading />
            ) : (
              bookings.data && (
                <>
                  <div className="table-scroll">
                    <table>
                      <caption className="sr-only">Reservas de todos los clientes</caption>
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Sala y horario</th>
                          <th>Estado</th>
                          <th>Total</th>
                          <th>
                            <span className="sr-only">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.data.items.map((booking) => (
                          <tr key={booking.id}>
                            <td>
                              <strong>{booking.customer?.fullName ?? 'Sin contacto'}</strong>
                              <small>{booking.customer?.email ?? 'Borrador'}</small>
                            </td>
                            <td>
                              {rooms.data?.items.find((room) => room.id === booking.roomId)?.name ??
                                'Sin sala'}
                              <small>
                                {booking.startsAt && booking.endsAt
                                  ? slotLabel(booking.startsAt, booking.endsAt)
                                  : 'Horario pendiente'}
                              </small>
                            </td>
                            <td>
                              <Badge status={booking.status} />
                            </td>
                            <td className="nowrap">
                              {booking.quoteSnapshot
                                ? cop(booking.quoteSnapshot.breakdown.total)
                                : '—'}
                            </td>
                            <td>
                              <Link className="inline-link" to={`/admin/reservas/${booking.id}`}>
                                Ver detalle →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!bookings.data.items.length && (
                    <Empty title="Sin reservas para estos filtros">
                      <p className="muted">Prueba otra sala o estado.</p>
                    </Empty>
                  )}
                  <Pagination
                    page={bookings.data.page}
                    pageSize={bookings.data.pageSize}
                    total={bookings.data.total}
                    busy={bookings.isFetching}
                    onPage={(page) => {
                      const next = new URLSearchParams(search);
                      next.set('page', String(page));
                      setSearch(next);
                    }}
                  />
                </>
              )
            )}
          </>
        )}
      </section>
    </>
  );
}
