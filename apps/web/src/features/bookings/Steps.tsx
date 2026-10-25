import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  customerSchema,
  quoteRequestSchema,
  serviceCodesSchema,
  type Booking,
  type Customer,
  type QuoteRequest,
  type ServiceCode,
} from '@lumni/shared';
import { ScheduleFields, ServiceFields } from '../../components/Fields.js';
import { initialSchedule, scheduleFields } from '../../lib/format.js';
import type { Room, Service } from '../../lib/data.js';
import { useSession } from '../../auth/Session.js';
type Common = {
  booking: Booking;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (value: object) => Promise<void>;
};
function SaveButtons({
  busy,
  dirty,
  reset,
  label,
}: {
  busy: boolean;
  dirty: boolean;
  reset: () => void;
  label: string;
}) {
  return (
    <div className="form-actions">
      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Guardando…' : label}
      </button>
      {dirty && (
        <button className="text-button" type="button" disabled={busy} onClick={reset}>
          Deshacer cambios
        </button>
      )}
    </div>
  );
}
export function ContactStep({ booking, busy, onDirty, onSave }: Common) {
  const { user } = useSession();
  const form = useForm<Customer>({
    defaultValues: {
      fullName: booking.customer?.fullName ?? user?.fullName ?? '',
      email: booking.customer?.email ?? user?.email ?? '',
      company: booking.customer?.company ?? '',
    },
  });
  const dirty = form.formState.isDirty;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(async (value) => {
          const parsed = customerSchema.safeParse(value);
          if (!parsed.success) {
            form.setError('root', { message: 'Revisa el nombre y el correo de contacto.' });
            return;
          }
          await onSave({ step: 1, customer: parsed.data });
        })(event);
      }}
    >
      <fieldset disabled={busy}>
        <label>
          Nombre de contacto
          <input {...form.register('fullName')} autoComplete="name" required maxLength={160} />
        </label>
        <label>
          Correo de contacto
          <input
            {...form.register('email')}
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          Empresa <span className="muted">(opcional)</span>
          <input {...form.register('company')} autoComplete="organization" maxLength={160} />
        </label>
        {form.formState.errors.root && (
          <p className="field-error" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}
        <SaveButtons
          busy={busy}
          dirty={dirty}
          reset={() => form.reset()}
          label="Guardar y continuar →"
        />
      </fieldset>
    </form>
  );
}
export function ScheduleStep({
  booking,
  busy,
  onDirty,
  onSave,
  rooms,
  alternative,
  onDiscardAlternative,
}: Common & {
  rooms: Room[];
  onDiscardAlternative: () => void;
  alternative?: { startsAt: string; endsAt: string } | undefined;
}) {
  const form = useForm<QuoteRequest>({
    defaultValues: {
      ...initialSchedule(booking.roomId ?? rooms[0]?.id),
      ...(booking.startsAt && booking.endsAt
        ? scheduleFields(booking.startsAt, booking.endsAt)
        : {}),
      ...(alternative ? scheduleFields(alternative.startsAt, alternative.endsAt) : {}),
      serviceCodes: [],
    },
  });
  const dirty = form.formState.isDirty || !!alternative;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(async (value) => {
          const parsed = quoteRequestSchema.safeParse(value);
          if (!parsed.success) {
            form.setError('root', { message: 'Revisa la sala y el horario.' });
            return;
          }
          await onSave({
            step: 2,
            roomId: parsed.data.roomId,
            date: parsed.data.date,
            startTime: parsed.data.startTime,
            durationMinutes: parsed.data.durationMinutes,
          });
        })(event);
      }}
    >
      <fieldset disabled={busy}>
        <ScheduleFields register={form.register} rooms={rooms} />
        {form.formState.errors.root && (
          <p className="field-error" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}
        <SaveButtons
          busy={busy}
          dirty={dirty}
          reset={() => {
            form.reset();
            onDiscardAlternative();
          }}
          label="Guardar horario y continuar →"
        />
      </fieldset>
    </form>
  );
}
export function ExtrasStep({
  booking,
  busy,
  onDirty,
  onSave,
  services,
  initialCodes,
}: Common & { services: Service[]; initialCodes: ServiceCode[] }) {
  const form = useForm<{ serviceCodes: ServiceCode[] }>({
    defaultValues: { serviceCodes: booking.serviceCodes ?? initialCodes },
  });
  const dirty = form.formState.isDirty;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(async (value) => {
          const parsed = serviceCodesSchema.safeParse(value.serviceCodes);
          if (!parsed.success) return;
          await onSave({ step: 3, serviceCodes: parsed.data });
        })(event);
      }}
    >
      <fieldset disabled={busy}>
        <ServiceFields
          services={services}
          selected={form.watch('serviceCodes')}
          onChange={(value) =>
            form.setValue('serviceCodes', value as ServiceCode[], { shouldDirty: true })
          }
        />
        <SaveButtons
          busy={busy}
          dirty={dirty}
          reset={() => form.reset()}
          label={
            booking.quoteSnapshot
              ? 'Actualizar precio y disponibilidad'
              : 'Guardar servicios y revisar precio →'
          }
        />
      </fieldset>
    </form>
  );
}
