import { DateTime } from 'luxon';
import { TIME_ZONE, dateReferenceSchema } from '@lumni/shared';
import type { z } from 'zod';
export const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
const weekdays = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export function dateExpression(value: string): z.infer<typeof dateReferenceSchema> | null {
  const text = normalize(value);
  const absolute = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (absolute) return { kind: 'absolute', date: absolute };
  if (/\bpasado manana\b/.test(text)) return { kind: 'relative_day', offsetDays: 2 };
  if (/\bmanana\b/.test(text.replace(/\b(?:en|por|de) la manana\b/g, '')))
    return { kind: 'relative_day', offsetDays: 1 };
  if (/\bhoy\b/.test(text)) return { kind: 'relative_day', offsetDays: 0 };
  const index = weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`).test(text));
  if (index < 0 || /\bproximo\b/.test(text)) return null;
  return {
    kind: 'weekday',
    isoWeekday: index + 1,
    relation: /\b(?:semana (?:siguiente|que viene)|siguiente semana)\b/.test(text)
      ? 'following_week'
      : 'next_or_today',
  };
}
export function resolveDate(reference: z.infer<typeof dateReferenceSchema>, now: Date): string {
  const ref = dateReferenceSchema.parse(reference);
  const today = DateTime.fromJSDate(now, { zone: TIME_ZONE }).startOf('day');
  if (!today.isValid) throw new Error('Reloj inválido');
  if (ref.kind === 'absolute') return ref.date;
  if (ref.kind === 'relative_day') return today.plus({ days: ref.offsetDays }).toISODate()!;
  const offset = (ref.isoWeekday - today.weekday + 7) % 7;
  return today
    .plus({ days: ref.relation === 'following_week' ? 7 - today.weekday + ref.isoWeekday : offset })
    .toISODate()!;
}
export function ambiguity(content: string): string | null {
  const text = normalize(content);
  if (/\bproximo\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(text))
    return '¿Qué fecha exacta quieres? Escríbela como AAAA-MM-DD para aclarar «próximo».';
  if (
    /\ba las?\s+(?:[1-9]|1[0-2])\b(?![:\d])/.test(text) &&
    !/\b(?:am|pm|manana|tarde|noche)\b/.test(text)
  )
    return '¿Cuál es la hora exacta en formato de 24 horas, por ejemplo 08:00 o 20:00?';
  return null;
}
