import { Modal } from '../../components/Modal.js';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelSchema, uuidSchema } from '@lumni/shared';
import { api } from '../../lib/data.js';
import { emailLabels, fullDate } from '../../lib/format.js';
import {
  BackLink,
  BookingSummary,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
} from '../../components/Feedback.js';
import { ApiError } from '../../api.js';
export function AdminBookingPage() {
  const id = useParams().id ?? '';
  const valid = uuidSchema.safeParse(id).success;
  const detail = useQuery({
    queryKey: ['admin-booking', id],
    queryFn: () => api.adminBooking(id),
    enabled: valid,
    staleTime: Infinity,
  });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: api.rooms });
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const lock = useRef(false);
  const mutation = useMutation({
    mutationFn: (input: { action: 'cancel' | 'complete'; body: object }) =>
      api.changeStatus(id, input.action, input.body),
  });
  const change = async (action: 'cancel' | 'complete') => {
    if (!detail.data || lock.current) return;
    const input = {
      expectedVersion: detail.data.booking.version,
      ...(action === 'cancel' ? { reason } : {}),
    };
    if (action === 'cancel' && !cancelSchema.safeParse(input).success) {
      setError(new Error('Escribe un motivo de cancelación de 1 a 1.000 caracteres.'));
      return;
    }
    lock.current = true;
    setError(null);
    setSuccess('');
    try {
      const result = await mutation.mutateAsync({ action, body: input });
      queryClient.setQueryData(['admin-booking', id], { ...detail.data, booking: result.booking });
      void detail.refetch();
      await queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
      setReason('');
      setCompleteOpen(false);
      setSuccess(
        action === 'cancel'
          ? 'Reserva cancelada. El horario vuelve a estar disponible.'
          : 'Reserva marcada como completada.',
      );
    } catch (error) {
      setError(error);
    } finally {
      lock.current = false;
    }
  };
  if (!valid) return <Notice kind="error">La referencia de reserva no es válida.</Notice>;
  if (!detail.data)
    return (
      <>
        <Loading />
        <ErrorNotice error={detail.error} />
        <button
          className="button secondary"
          onClick={() => {
            void detail.refetch();
          }}
        >
          Volver a cargar
        </button>
      </>
    );
  const { booking, email } = detail.data;
  const ended = !!booking.endsAt && Date.parse(booking.endsAt) <= Date.now();
  return (
    <>
      <BackLink to="/admin/reservas">Todas las reservas</BackLink>
      <PageHeading eyebrow="ADMINISTRACIÓN" title="Los detalles del encuentro.">
        <button
          className="button secondary compact"
          disabled={mutation.isPending || detail.isFetching}
          onClick={() => {
            void detail.refetch();
          }}
        >
          Actualizar
        </button>
      </PageHeading>
      {success && <Notice kind="success">{success}</Notice>}
      <ErrorNotice error={error ?? detail.error} />
      {error instanceof ApiError && error.status === 409 && (
        <button
          className="button secondary compact"
          onClick={() => {
            void detail.refetch().then(() => setError(null));
          }}
        >
          Cargar estado y versión actuales
        </button>
      )}
      <div className="two-column">
        <BookingSummary
          booking={booking}
          roomName={rooms.data?.items.find((room) => room.id === booking.roomId)?.name}
        />
        <div>
          <section className="card">
            <span className="eyebrow">CONFIRMACIÓN POR CORREO</span>
            <h2>{email ? emailLabels[email.status] : 'Sin correo de confirmación'}</h2>
            {email ? (
              <>
                <dl className="details">
                  <div>
                    <dt>Intentos</dt>
                    <dd>{email.attempts}</dd>
                  </div>
                  {email.sentAt && (
                    <div>
                      <dt>Capturado</dt>
                      <dd>{fullDate(email.sentAt)}</dd>
                    </div>
                  )}
                  {email.lastError && (
                    <div>
                      <dt>Último error</dt>
                      <dd>{email.lastError}</dd>
                    </div>
                  )}
                </dl>
                <Link className="inline-link" to={`/admin/correos/${email.id}`}>
                  Ver contenido y estado →
                </Link>
              </>
            ) : (
              <p className="muted">El correo se genera al confirmar una reserva.</p>
            )}
          </section>
          {booking.status === 'confirmed' && (
            <section className="card">
              <h2>Gestionar reserva</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void change('cancel');
                }}
              >
                <fieldset disabled={mutation.isPending}>
                  <label>
                    Motivo de cancelación
                    <textarea
                      required
                      maxLength={1000}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Indica por qué se cancela esta reserva"
                    />
                  </label>
                  <button className="button danger" type="submit">
                    {mutation.isPending ? 'Guardando…' : 'Cancelar reserva'}
                  </button>
                </fieldset>
              </form>
              <div className="divider" />
              <button
                className="button secondary"
                disabled={!ended || mutation.isPending}
                onClick={() => setCompleteOpen(true)}
              >
                Marcar como completada
              </button>
              {!ended && (
                <p className="form-note">Disponible cuando termine el horario de la reserva.</p>
              )}
            </section>
          )}
        </div>
      </div>
      {completeOpen && (
        <Modal
          titleId="complete-title"
          onDismiss={mutation.isPending ? undefined : () => setCompleteOpen(false)}
        >
          <h2 id="complete-title">¿El encuentro ya terminó?</h2>
          <p>La reserva quedará completada y conservará su precio y confirmación.</p>
          <button
            className="button"
            disabled={mutation.isPending}
            onClick={() => {
              void change('complete');
            }}
          >
            Sí, marcar como completada
          </button>
          <button
            className="button secondary"
            disabled={mutation.isPending}
            onClick={() => setCompleteOpen(false)}
          >
            Volver
          </button>
          <ErrorNotice error={error} />
        </Modal>
      )}
    </>
  );
}
