import type { UseFormRegister } from 'react-hook-form';
import type { QuoteRequest } from '@lumni/shared';
import type { Room, Service } from '../lib/data.js';
import { cop, today } from '../lib/format.js';
export function ScheduleFields({
  register,
  rooms,
}: {
  register: UseFormRegister<QuoteRequest>;
  rooms: Room[];
}) {
  return (
    <div className="form-grid">
      <label className="full">
        Sala
        <select aria-label="Sala" {...register('roomId', { required: true })} required>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name} · hasta {room.capacity} personas
            </option>
          ))}
        </select>
      </label>
      <label>
        Fecha
        <input
          aria-label="Fecha"
          type="date"
          min={today()}
          {...register('date', { required: true })}
          required
        />
      </label>
      <label>
        Hora de inicio
        <select aria-label="Hora de inicio" {...register('startTime', { required: true })}>
          {Array.from({ length: 28 }, (_, index) => {
            const time = `${String(7 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`;
            return <option key={time}>{time}</option>;
          })}
        </select>
      </label>
      <label className="full">
        Duración
        <select aria-label="Duración" {...register('durationMinutes', { valueAsNumber: true })}>
          {Array.from({ length: 19 }, (_, index) => {
            const minutes = 60 + index * 30;
            return (
              <option key={minutes} value={minutes}>
                {minutes / 60} {minutes === 60 ? 'hora' : 'horas'}
              </option>
            );
          })}
        </select>
      </label>
      <p className="form-note full">Lunes a sábado, 7:00 a. m. a 9:00 p. m. · Hora de Colombia.</p>
    </div>
  );
}
export function ServiceFields({
  services,
  selected,
  onChange,
}: {
  services: Service[];
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  return (
    <div className="service-options">
      {services.map((service) => (
        <label className="service-option" key={service.code}>
          <input
            type="checkbox"
            value={service.code}
            checked={selected.includes(service.code)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, service.code]
                  : selected.filter((code) => code !== service.code),
              )
            }
          />
          <span>
            <strong>{service.name}</strong>
            <small>Por reserva</small>
          </span>
          <b>{cop(service.flatPriceCop)}</b>
        </label>
      ))}
      <p className="form-note">Puedes continuar sin servicios adicionales.</p>
    </div>
  );
}
