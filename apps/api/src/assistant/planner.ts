import { type AssistantExtraction, type AssistantSlots } from '@lumni/shared';
import { resolveDate } from './dates.js';
import type { RoomChoice } from './llm.js';
export function planSlots(
  previous: AssistantSlots,
  patch: AssistantExtraction['patch'],
  rooms: RoomChoice[],
  now: Date,
) {
  const slots: AssistantSlots = { ...previous, ...patch };
  if (patch.dateReference) slots.date = resolveDate(patch.dateReference, now);
  if (patch.participants !== undefined && !patch.roomId) delete slots.roomId;
  if (!slots.participants) return { slots, question: '¿Para cuántas personas necesitas la sala?' };
  if (!slots.roomId) {
    const room = [...rooms]
      .sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id))
      .find((r) => r.capacity >= slots.participants!);
    if (room) slots.roomId = room.id;
  }
  const room = rooms.find((r) => r.id === slots.roomId);
  if (!room || room.capacity < slots.participants)
    return {
      slots,
      question:
        'No tenemos una sala suficiente para esa cantidad. ¿Cuántas personas asistirán finalmente?',
    };
  if (!slots.date) return { slots, question: '¿Para qué fecha necesitas la sala?' };
  if (!slots.startTime)
    return {
      slots,
      question:
        '¿A qué hora exacta quieres comenzar? Usa el formato de 24 horas, por ejemplo 09:00.',
    };
  const hour = Number(slots.startTime.slice(0, 2));
  if (
    (slots.period === 'morning' && hour >= 12) ||
    (slots.period === 'afternoon' && (hour < 12 || hour >= 18)) ||
    (slots.period === 'evening' && hour < 18)
  )
    return {
      slots,
      question:
        'La hora no coincide con el periodo elegido. ¿Prefieres por la mañana, por la tarde o por la noche?',
    };
  if (!slots.durationMinutes)
    return {
      slots,
      question: '¿Cuánto tiempo necesitas? Indica horas o minutos, por ejemplo 2 horas.',
    };
  if (!slots.serviceCodes)
    return { slots, question: '¿Qué extras quieres: café, proyector, ambos o sin extras?' };
  return { slots, question: null };
}
export function restricted(content: string) {
  return /\b(?:confirm[a-záéíóú]*|cancel[a-záéíóú]*|ignora[r]?\s+(?:las?\s+)?reglas|customer_?id|owner_?id|system\s*:|reservas?\s+(?:ajenas?|de otro))\b/i.test(
    content,
  );
}
