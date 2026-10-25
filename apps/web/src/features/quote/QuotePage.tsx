import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { quoteRequestSchema, type Quote, type QuoteRequest, type ServiceCode } from '@lumni/shared';
import { api } from '../../lib/data.js';
import { cop, initialSchedule, scheduleFields } from '../../lib/format.js';
import {
  Availability,
  Breakdown,
  ErrorNotice,
  Loading,
  PageHeading,
} from '../../components/Feedback.js';
import { ScheduleFields, ServiceFields } from '../../components/Fields.js';
import { useSession } from '../../auth/Session.js';
export function QuotePage() {
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: api.rooms });
  const services = useQuery({ queryKey: ['services'], queryFn: api.services });
  if (!rooms.data || !services.data)
    return (
      <>
        <Loading label="Preparando tus espacios…" />
        <ErrorNotice error={rooms.error ?? services.error} />
        <button
          className="button secondary"
          onClick={() => {
            void rooms.refetch();
            void services.refetch();
          }}
        >
          Volver a intentar
        </button>
      </>
    );
  return <QuoteForm rooms={rooms.data.items} services={services.data.items} />;
}
function QuoteForm({
  rooms,
  services,
}: {
  rooms: Awaited<ReturnType<typeof api.rooms>>['items'];
  services: Awaited<ReturnType<typeof api.services>>['items'];
}) {
  const form = useForm<QuoteRequest>({ defaultValues: initialSchedule(rooms[0]?.id) });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotedInput, setQuotedInput] = useState<QuoteRequest | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const navigate = useNavigate();
  const { user } = useSession();
  const serviceCodes = form.watch('serviceCodes');
  const input = form.watch();
  const current = quotedInput && JSON.stringify(input) === JSON.stringify(quotedInput);
  const submit = form.handleSubmit(async (value) => {
    const parsed = quoteRequestSchema.safeParse(value);
    if (!parsed.success) {
      setError(new Error('Revisa la sala, fecha, horario y servicios seleccionados.'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      setQuote(await api.quote(parsed.data));
      setQuotedInput(parsed.data);
      form.reset(parsed.data);
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  });
  const start = async () => {
    if (!quote?.canBook || !quotedInput || !current || !user || lock.current) return;
    lock.current = true;
    setCreating(true);
    setError(null);
    try {
      const created = await api.create({
        clientRequestId: requestId.current,
        customer: { fullName: user.fullName },
      });
      const booking = created.booking;
      await api.save(booking.id, {
        step: 2,
        expectedVersion: booking.version,
        roomId: quotedInput.roomId,
        date: quotedInput.date,
        startTime: quotedInput.startTime,
        durationMinutes: quotedInput.durationMinutes,
      });
      navigate(`/reservas/${booking.id}`, {
        state: { initialStep: 1, serviceCodes: quotedInput.serviceCodes },
      });
    } catch (error) {
      setError(error);
    } finally {
      lock.current = false;
      setCreating(false);
    }
  };
  return (
    <>
      <PageHeading eyebrow="ESPACIOS EN MEDELLÍN" title="Un lugar para lo que viene.">
        <p className="heading-note">
          Elige tu espacio.
          <br />
          Nosotros ponemos el resto.
        </p>
      </PageHeading>
      <div className="room-cards">
        {rooms.map((room, index) => (
          <button
            type="button"
            className={`room-card ${form.watch('roomId') === room.id ? 'selected' : ''}`}
            aria-pressed={form.watch('roomId') === room.id}
            disabled={pending || creating}
            key={room.id}
            onClick={() => form.setValue('roomId', room.id, { shouldDirty: true })}
          >
            <span className={`room-illustration size-${index}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="row between">
              <strong>{room.name}</strong>
              <span className="capacity">↗ {room.capacity} personas</span>
            </span>
            <span className="room-description">
              {index === 0
                ? 'Concentración y pequeñas ideas.'
                : index === 1
                  ? 'Un punto de encuentro para tu equipo.'
                  : 'Más espacio para pensar en grande.'}
            </span>
            <span className="room-rate">
              {cop(room.hourlyRateCop)}
              <small> / hora</small>
            </span>
          </button>
        ))}
      </div>
      <div className="two-column quote-layout">
        <section className="card">
          <div className="section-title">
            <span className="step-number">01</span>
            <div>
              <h2>Haz espacio en tu agenda</h2>
              <p className="muted">Escoge el día y el tiempo que necesitas.</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <fieldset disabled={pending || creating}>
              <ScheduleFields register={form.register} rooms={rooms} />
              <h3 className="subheading">Un poco más para tu reunión</h3>
              <ServiceFields
                services={services}
                selected={serviceCodes}
                onChange={(codes) =>
                  form.setValue('serviceCodes', codes as ServiceCode[], { shouldDirty: true })
                }
              />
              <button className="button" type="submit">
                {pending ? 'Consultando…' : 'Consultar disponibilidad →'}
              </button>
            </fieldset>
          </form>
          <ErrorNotice error={error} />
        </section>
        <aside className="card price-card">
          <span className="eyebrow">TU ENCUENTRO, EN NÚMEROS</span>
          <h2>Todo claro desde el inicio.</h2>
          {quote && current ? (
            <>
              <Breakdown quote={quote} />
              <Availability
                quote={quote}
                onAlternative={(slot) => {
                  form.setValue('date', scheduleFields(slot.startsAt, slot.endsAt).date);
                  form.setValue('startTime', scheduleFields(slot.startsAt, slot.endsAt).startTime);
                  setQuote(null);
                }}
              />
              <button
                className="button lime"
                disabled={!quote.canBook || creating || pending}
                onClick={() => {
                  void start();
                }}
              >
                {creating ? 'Preparando reserva…' : 'Continuar con esta reserva →'}
              </button>
            </>
          ) : (
            <div className="quote-placeholder">
              <span aria-hidden="true">◷</span>
              <p>
                {quote
                  ? 'Cambiaste tu selección. Consulta de nuevo para ver el precio actualizado.'
                  : 'Tu cotización aparecerá aquí cuando elijas un horario.'}
              </p>
              <small>
                10 % de descuento desde 4 horas.
                <br />
                20 % desde 8 horas. Recargo del sábado: 25 %.
              </small>
            </div>
          )}
          <p className="form-note">
            La cotización no bloquea el espacio. Tu reserva queda lista al confirmar.
          </p>
        </aside>
      </div>
    </>
  );
}
