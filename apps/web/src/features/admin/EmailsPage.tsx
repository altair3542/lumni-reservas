import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { emailQueueQuerySchema, uuidSchema } from '@lumni/shared';
import { api } from '../../lib/data.js';
import { emailLabels, fullDate } from '../../lib/format.js';
import {
  BackLink,
  Empty,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
} from '../../components/Feedback.js';
import { Pagination } from './AdminBookingsPage.js';
export function EmailsPage() {
  const [search, setSearch] = useSearchParams();
  const valid = emailQueueQuerySchema.safeParse(Object.fromEntries(search)).success;
  const emails = useQuery({
    queryKey: ['emails', search.toString()],
    queryFn: () => api.emails(search.toString()),
    enabled: valid,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'pending') ? 2000 : false,
  });
  return (
    <>
      <PageHeading eyebrow="ADMINISTRACIÓN" title="La confirmación, a la vista.">
        <button
          className="button secondary compact"
          disabled={emails.isFetching}
          onClick={() => {
            void emails.refetch();
          }}
        >
          Actualizar
        </button>
      </PageHeading>
      <section className="card table-card">
        <div className="filters">
          <label>
            Estado del correo
            <select
              value={search.get('status') ?? ''}
              onChange={(event) => {
                const next = new URLSearchParams(search);
                next.delete('page');
                if (event.target.value) next.set('status', event.target.value);
                else next.delete('status');
                setSearch(next);
              }}
            >
              <option value="">Todos los estados</option>
              {Object.entries(emailLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!valid ? (
          <Notice kind="error">
            Los filtros no son válidos.{' '}
            <button className="text-button" onClick={() => setSearch({})}>
              Restablecer filtros
            </button>
          </Notice>
        ) : (
          <>
            <ErrorNotice error={emails.error} />
            {emails.isPending ? (
              <Loading />
            ) : (
              emails.data && (
                <>
                  <div className="table-scroll">
                    <table>
                      <caption className="sr-only">Estado de los correos de confirmación</caption>
                      <thead>
                        <tr>
                          <th>Reserva</th>
                          <th>Estado</th>
                          <th>Intentos</th>
                          <th>Último error</th>
                          <th>
                            <span className="sr-only">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {emails.data.items.map((email) => (
                          <tr key={email.id}>
                            <td>
                              <Link
                                className="inline-link"
                                to={`/admin/reservas/${email.bookingId}`}
                              >
                                {email.bookingId.slice(0, 8)}
                              </Link>
                            </td>
                            <td>
                              <span className={`badge ${email.status}`}>
                                {emailLabels[email.status]}
                              </span>
                            </td>
                            <td>{email.attempts}</td>
                            <td>{email.lastError ?? '—'}</td>
                            <td>
                              <Link className="inline-link" to={`/admin/correos/${email.id}`}>
                                Ver correo →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!emails.data.items.length && (
                    <Empty title="Sin correos para mostrar">
                      <p className="muted">Las confirmaciones aparecerán aquí.</p>
                    </Empty>
                  )}
                  <Pagination
                    page={emails.data.page}
                    pageSize={emails.data.pageSize}
                    total={emails.data.total}
                    busy={emails.isFetching}
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
export function EmailPage() {
  const id = useParams().id ?? '';
  const valid = uuidSchema.safeParse(id).success;
  const email = useQuery({
    queryKey: ['email', id],
    queryFn: () => api.email(id),
    enabled: valid,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.event.status === 'pending' ? 2000 : false),
  });
  if (!valid) return <Notice kind="error">La referencia del correo no es válida.</Notice>;
  if (!email.data)
    return (
      <>
        <Loading />
        <ErrorNotice error={email.error} />
        <button
          className="button secondary"
          onClick={() => {
            void email.refetch();
          }}
        >
          Volver a cargar
        </button>
      </>
    );
  const { event, payload, capture } = email.data;
  return (
    <>
      <BackLink to="/admin/correos">Correos</BackLink>
      <PageHeading
        eyebrow="CORREO DE CONFIRMACIÓN"
        title={emailLabels[event.status] ?? event.status}
      >
        <button
          className="button secondary compact"
          disabled={email.isFetching}
          onClick={() => {
            void email.refetch();
          }}
        >
          Actualizar
        </button>
      </PageHeading>
      <ErrorNotice error={email.error} />
      <Notice>
        Este correo se guarda como captura local de demostración; no se envía a un buzón externo.
      </Notice>
      <div className="two-column">
        <section className="card">
          <dl className="details">
            <div>
              <dt>Para</dt>
              <dd>{payload.toEmail}</dd>
            </div>
            <div>
              <dt>Asunto</dt>
              <dd>{payload.subject}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                {emailLabels[event.status]} · {event.attempts} intentos
              </dd>
            </div>
            {event.lastError && (
              <div>
                <dt>Último error</dt>
                <dd>{event.lastError}</dd>
              </div>
            )}
          </dl>
          <Link className="inline-link" to={`/admin/reservas/${event.bookingId}`}>
            Ver reserva →
          </Link>
        </section>
        <section className="card">
          <h2>{capture ? 'Confirmación capturada' : 'Contenido de la confirmación'}</h2>
          {capture ? (
            <p className="muted">Capturada el {fullDate(capture.capturedAt)}</p>
          ) : (
            <Notice>Este correo todavía no tiene una captura local.</Notice>
          )}
          <pre className="email-body">{capture?.textBody ?? payload.textBody}</pre>
        </section>
      </div>
    </>
  );
}
