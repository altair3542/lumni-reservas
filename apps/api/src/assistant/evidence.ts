import { assistantExtractionSchema, type AssistantExtraction } from '@lumni/shared';
import { dateExpression, normalize } from './dates.js';
import { unavailable, type RoomChoice } from './llm.js';

const words: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  veinte: 20,
};
const number = (value: string) => words[value] ?? Number(value.replace(',', '.'));
export function timeExpression(value: string): string | null {
  const text = normalize(value).replaceAll('.', '');
  const match =
    text.match(/\b(\d{1,2}):(00|30)\s*(am|pm)?\b/) ??
    text.match(/\b(\d{1,2})(?:\s*)(am|pm|de la manana|de la tarde|de la noche)\b/);
  if (!match) return null;
  let hour = Number(match[1]);
  const hasMinutes = match[2] === '00' || match[2] === '30';
  const minutes = hasMinutes ? match[2] : '00';
  const meridiem = hasMinutes ? match[3] : match[2];
  if (meridiem && hour >= 1 && hour <= 12) {
    if (/pm|tarde|noche/.test(meridiem) && hour < 12) hour += 12;
    if (/am|manana/.test(meridiem) && hour === 12) hour = 0;
  }
  return hour < 24 ? `${String(hour).padStart(2, '0')}:${minutes}` : null;
}
export function durationExpression(value: string): number | null {
  const text = normalize(value);
  const match = text.match(
    /\b(\d+(?:[.,]\d+)?|un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(horas?|minutos?)\b/,
  );
  if (!match) return null;
  return (
    number(match[1]!) * (match[2]!.startsWith('hora') ? 60 : 1) +
    (/horas? y media\b/.test(text) ? 30 : 0)
  );
}
export function validateExtraction(
  raw: unknown,
  content: string,
  rooms: RoomChoice[],
): AssistantExtraction {
  const parsed = assistantExtractionSchema.safeParse(raw);
  if (!parsed.success || JSON.stringify(raw).length > 16000) throw unavailable();
  const result = parsed.data;
  for (const field of Object.keys(result.patch) as (keyof AssistantExtraction['patch'])[]) {
    const quote = result.evidence[field];
    if (!quote || !content.includes(quote)) throw unavailable();
    const text = normalize(quote);
    const fullText = normalize(content);
    const value = result.patch[field];
    let valid = false;
    switch (field) {
      case 'participants': {
        const match =
          text.match(
            /\b(\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|veinte)\s*(?:personas?|participantes?|asistentes?)\b/,
          ) ?? (content.trim() === quote ? text.match(/^(\d+)$/) : null);
        valid = Boolean(match && number(match[1]!) === value);
        break;
      }
      case 'startTime':
        valid = timeExpression(quote) === value;
        break;
      case 'durationMinutes':
        valid = durationExpression(quote) === value;
        break;
      case 'dateReference':
        valid = JSON.stringify(dateExpression(quote)) === JSON.stringify(value);
        if (
          result.patch.dateReference?.kind === 'relative_day' &&
          result.patch.dateReference.offsetDays === 1 &&
          dateExpression(content)?.kind !== 'relative_day'
        )
          valid = false;
        break;
      case 'period':
        valid =
          value === 'morning'
            ? /\b(?:en|por|de) la manana\b/.test(text)
            : value === 'afternoon'
              ? /\btarde\b/.test(text)
              : /\bnoche\b/.test(text);
        break;
      case 'roomId': {
        const room = rooms.find((r) => r.id === value);
        const size = { small: 'pequena', medium: 'mediana', large: 'grande' }[room?.size ?? ''];
        valid = Boolean(
          room &&
            (text.includes(room.id) ||
              text.includes(normalize(room.name)) ||
              (size && new RegExp(`\\bsala ${size}\\b`).test(text))),
        );
        break;
      }
      case 'serviceCodes': {
        const codes = result.patch.serviceCodes!;
        const none =
          /\b(?:sin (?:extras|servicios|adicionales)|ningun(?:o|os)?(?: extra| servicio)?|ninguno)\b/.test(
            text,
          );
        const negative = /\b(?:sin|no quiero|no necesito)\b/.test(text);
        const denied = (code: string) =>
          new RegExp(
            code === 'projector'
              ? '\\b(?:sin|no quiero|no necesito)\\s+(?:el\\s+)?(?:proyector|projector)\\b'
              : '\\b(?:sin|no quiero|no necesito)\\s+(?:el\\s+)?(?:cafe|coffee)\\b',
          ).test(fullText);
        const expected = [
          ...(/\b(?:cafe|coffee)\b/.test(text) ? ['coffee'] : []),
          ...(/\b(?:proyector|projector)\b/.test(text) ? ['projector'] : []),
        ];
        valid =
          codes.length === 0
            ? none
            : !negative &&
              !codes.some(denied) &&
              JSON.stringify([...codes].sort()) === JSON.stringify(expected.sort());
        break;
      }
    }
    if (!valid) throw unavailable();
  }
  return result;
}
