import { Modal } from '../../components/Modal.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBeforeUnload, useBlocker, useLocation, useParams } from 'react-router-dom';
import { uuidSchema, serviceCodesSchema, type Booking, type Quote } from '@lumni/shared';
import { ApiError } from '../../api.js';
import { api, type Room, type Service } from '../../lib/data.js';
import {
  BackLink,
  BookingSummary,
  Availability,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
} from '../../components/Feedback.js';
import { ContactStep, ExtrasStep, ScheduleStep } from './Steps.js';
export function BookingPage() {
  const id = useParams().id ?? '';
  const valid = uuidSchema.safeParse(id).success;
  const booking = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.booking(id),
    enabled: valid,
    staleTime: Infinity,
  });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: api.rooms });
  const services = useQuery({ queryKey: ['services'], queryFn: api.services });
  if (!valid) return <Notice kind="error">La referencia de reserva no es válida.</Notice>;
  if (!booking.data || !rooms.data || !services.data)
    return (
      <>
        <Loading />
        <ErrorNotice error={booking.error ?? rooms.error ?? services.error} />
        <button
          className="button secondary"
          onClick={() => {
            void booking.refetch();
            void rooms.refetch();
            void services.refetch();
          }}
        >
          Volver a cargar
        </button>
      </>
    );
  return (
    <>
      <BackLink to="/reservas">Mis reservas</BackLink>
      {booking.data.booking.status === 'draft' ? (
        <Wizard
          key={id}
          booking={booking.data.booking}
          rooms={rooms.data.items}
          services={services.data.items}
        />
      ) : (
        <>
          <PageHeading
            eyebrow="TODO EN SU LUGAR"
            title={
              booking.data.booking.status === 'confirmed'
                ? 'Tu encuentro está confirmado.'
                : 'Detalle de tu reserva'
            }
          />
          <BookingSummary
            booking={booking.data.booking}
            roomName={
              rooms.data.items.find((room) => room.id === booking.data.booking.roomId)?.name
            }
          />
          <Link className="button compact" to="/salas">
            Planear otro encuentro →
          </Link>
        </>
      )}
    </>
  );
}
function Wizard({
  booking,
  rooms,
  services,
}: {
  booking: Booking;
  rooms: Room[];
  services: Service[];
}) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<number>(
    location.state?.initialStep === 1 ? 1 : booking.wizardStep,
  );
  const initialCodes = serviceCodesSchema.safeParse(location.state?.serviceCodes).data ?? [];
  const [dirty, setDirty] = useState(false);
  const onDirty = useCallback((value: boolean) => setDirty(value), []);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState('');
  const [alternative, setAlternative] = useState<NonNullable<Quote['suggestedSlot']>>();
  const [confirming, setConfirming] = useState(false);
  const lock = useRef(false);
  const mutation = useMutation({
    mutationFn: (value: { kind: 'save'; input: object } | { kind: 'confirm' }) =>
      value.kind === 'save'
        ? api.save(booking.id, { ...value.input, expectedVersion: booking.version })
        : api.confirm(booking.id, booking.version),
  });
  const busy = mutation.isPending;
  const blocker = useBlocker(dirty || busy);
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty || busy) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [dirty, busy],
    ),
  );
  useEffect(() => {
    if (blocker.state === 'blocked' && !dirty && !busy) blocker.proceed();
  }, [blocker, dirty, busy]);
  const save = async (input: object) => {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setSaved('');
    try {
      const result = await mutation.mutateAsync({ kind: 'save', input });
      setDirty(false);
      setAlternative(undefined);
      queryClient.setQueryData(['booking', booking.id], result);
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setStep('step' in input && input.step === 1 ? 2 : result.booking.wizardStep);
      setSaved('Paso guardado. Puedes retomarlo cuando quieras.');
    } catch (error) {
      setError(error);
    } finally {
      lock.current = false;
    }
  };
  const confirm = async () => {
    if (lock.current || dirty || !booking.quoteSnapshot) return;
    lock.current = true;
    setError(null);
    try {
      const result = await mutation.mutateAsync({ kind: 'confirm' });
      setConfirming(false);
      setDirty(false);
      queryClient.setQueryData(['booking', booking.id], result);
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    } catch (error) {
      setError(error);
      setConfirming(false);
    } finally {
      lock.current = false;
    }
  };
  const chooseAlternative = (slot: NonNullable<Quote['suggestedSlot']>) => {
    setAlternative(slot);
    setStep(2);
    setError(null);
    setSaved('Revisa y guarda el nuevo horario antes de continuar.');
  };
  const reload = async () => {
    try {
      const result = await api.booking(booking.id);
      queryClient.setQueryData(['booking', booking.id], result);
      setStep(result.booking.wizardStep);
      setDirty(false);
      setError(null);
      setSaved('Cargamos la versión guardada.');
    } catch (error) {
      setError(error);
    }
  };
  const room = rooms.find((room) => room.id === booking.roomId);
  return (
    <>
      <PageHeading eyebrow="HAZLO TUYO" title="Tu encuentro, paso a paso." />
      <div className="steps" aria-label="Pasos de la reserva">
        {['Tus datos', 'Sala y horario', 'Servicios y confirmación'].map((title, index) => (
          <button
            key={title}
            className={step === index + 1 ? 'current' : ''}
            type="button"
            disabled={busy || dirty}
            aria-current={step === index + 1 ? 'step' : undefined}
            onClick={() => {
              setStep(index + 1);
              setError(null);
              setSaved('');
            }}
          >
            <span>{index + 1}</span>
            {title}
          </button>
        ))}
      </div>
      <div className="two-column wizard-layout">
        <section className="card">
          <span className="eyebrow">PASO {step} DE 3</span>
          <h2>
            {step === 1
              ? '¿A nombre de quién reservamos?'
              : step === 2
                ? 'El momento y el lugar.'
                : 'Los detalles hacen la diferencia.'}
          </h2>
          <p className="muted">
            {step === 1
              ? 'Usaremos este correo para la confirmación.'
              : step === 2
                ? 'Revisa los datos y guarda el horario elegido.'
                : 'Elige tus servicios y guarda para revisar el precio final.'}
          </p>
          <div key={`${booking.version}-${step}-${alternative?.startsAt ?? ''}`}>
            {step === 1 ? (
              <ContactStep booking={booking} busy={busy} onDirty={onDirty} onSave={save} />
            ) : step === 2 ? (
              <ScheduleStep
                booking={booking}
                busy={busy}
                onDirty={onDirty}
                onSave={save}
                rooms={rooms}
                alternative={alternative}
                onDiscardAlternative={() => setAlternative(undefined)}
              />
            ) : (
              <ExtrasStep
                booking={booking}
                busy={busy}
                onDirty={onDirty}
                onSave={save}
                services={services}
                initialCodes={initialCodes}
              />
            )}
          </div>
          {busy ? (
            <Loading label="Guardando en tu reserva…" />
          ) : dirty ? (
            <p className="save-indicator">Tienes cambios sin guardar.</p>
          ) : saved ? (
            <Notice kind="success">{saved}</Notice>
          ) : (
            <p className="form-note">Los datos guardados se recuperan desde cualquier navegador.</p>
          )}
          <ErrorNotice error={error} />
          {error instanceof ApiError && error.code === 'VERSION_CONFLICT' && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                void reload();
              }}
            >
              Cargar versión guardada y descartar esta edición
            </button>
          )}
          {error instanceof ApiError && error.code === 'ROOM_UNAVAILABLE' && (
            <>
              <Availability
                quote={{
                  canBook: false,
                  message: 'Ese horario acaba de ocuparse. Elige otra opción para continuar.',
                  suggestedSlot: error.suggestedSlot ?? null,
                }}
                onAlternative={chooseAlternative}
              />
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setStep(2);
                  setError(null);
                }}
              >
                Editar horario
              </button>
            </>
          )}
          {error instanceof ApiError &&
            ['PAST', 'OUTSIDE_HOURS', 'INCOMPLETE_DRAFT'].includes(error.code) && (
              <button
                className="text-button"
                onClick={() => setStep(error.code === 'INCOMPLETE_DRAFT' ? booking.wizardStep : 2)}
              >
                Revisar los pasos de mi reserva
              </button>
            )}
        </section>
        <aside>
          <BookingSummary booking={booking} roomName={room?.name} />
          {step === 3 && booking.quoteSnapshot && (
            <section className="card confirm-card">
              <Availability quote={booking.quoteSnapshot} onAlternative={chooseAlternative} />
              <button
                className="button lime"
                type="button"
                disabled={busy || dirty || !booking.quoteSnapshot.canBook}
                onClick={() => setConfirming(true)}
              >
                Confirmar reserva →
              </button>
              <p className="form-note">
                Revisa el precio guardado. La confirmación es el último paso.
              </p>
            </section>
          )}
        </aside>
      </div>
      {confirming && (
        <Modal titleId="confirm-title" onDismiss={busy ? undefined : () => setConfirming(false)}>
          <h2 id="confirm-title">¿Todo listo para encontrarnos?</h2>
          <p>Confirmaremos esta reserva con el horario y el precio que revisaste.</p>
          <div className="form-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                void confirm();
              }}
            >
              {busy ? 'Confirmando…' : 'Sí, confirmar reserva'}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Seguir revisando
            </button>
          </div>
        </Modal>
      )}
      {blocker.state === 'blocked' && (
        <Modal titleId="unsaved-title" onDismiss={busy ? undefined : () => blocker.reset()}>
          <h2 id="unsaved-title">Hay cambios sin guardar</h2>
          <p>
            {busy
              ? 'Espera a que termine el guardado para salir.'
              : 'Si sales, perderás los cambios de este paso. Los pasos guardados se conservan.'}
          </p>
          <button className="button secondary" disabled={busy} onClick={() => blocker.reset()}>
            Seguir editando
          </button>
          <button className="button danger" disabled={busy} onClick={() => blocker.proceed()}>
            Salir sin guardar
          </button>
        </Modal>
      )}
    </>
  );
}
