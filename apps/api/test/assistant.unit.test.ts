import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantExtractionSchema, type AssistantExtraction } from '@lumni/shared';
import { dateExpression, resolveDate, ambiguity } from '../src/assistant/dates.js';
import {
  durationExpression,
  timeExpression,
  validateExtraction,
} from '../src/assistant/evidence.js';
import { planSlots } from '../src/assistant/planner.js';
import { createLlmClient, GeminiClient } from '../src/assistant/llm.js';

const rooms = [
  { id: '00000000-0000-4000-8000-000000000201', name: 'Sala pequeña', size: 'small', capacity: 4 },
  { id: '00000000-0000-4000-8000-000000000202', name: 'Sala mediana', size: 'medium', capacity: 8 },
];
const now = new Date('2026-10-24T03:00:00Z'); // Viernes 23, 22:00 en Bogotá; sábado en UTC.
afterEach(() => vi.unstubAllGlobals());
describe('Asistente: fechas y evidencia verificadas en código', () => {
  it('resuelve mañana y sábado desde Bogotá; no depende de la TZ del servidor', () => {
    expect(resolveDate(dateExpression('mañana')!, now)).toBe('2026-10-24');
    expect(resolveDate(dateExpression('el sábado')!, now)).toBe('2026-10-24');
    expect(resolveDate(dateExpression('pasado mañana')!, now)).toBe('2026-10-25');
    expect(resolveDate(dateExpression('lunes de la semana siguiente')!, now)).toBe('2026-10-26');
    expect(resolveDate(dateExpression('hoy')!, now)).toBe('2026-10-23');
    expect(resolveDate(dateExpression('2026-11-02')!, now)).toBe('2026-11-02');
  });
  it('incluye hoy sábado y pregunta ambigüedades sin saltar a otra semana', () => {
    expect(resolveDate(dateExpression('sábado')!, new Date('2026-10-24T20:00:00Z'))).toBe(
      '2026-10-24',
    );
    expect(dateExpression('próximo sábado')).toBeNull();
    expect(ambiguity('el próximo sábado')).toContain('fecha exacta');
    expect(ambiguity('a las 8')).toContain('24 horas');
    expect(ambiguity('a las 08:00')).toBeNull();
  });
  it('interpreta unidades y hora explícita, nunca convierte mañana en una hora', () => {
    expect(timeExpression('en la mañana')).toBeNull();
    expect(timeExpression('8 pm')).toBe('20:00');
    expect(timeExpression('12 am')).toBe('00:00');
    expect(timeExpression('09:30')).toBe('09:30');
    expect(timeExpression('a las 8')).toBeNull();
    expect(durationExpression('dos horas')).toBe(120);
    expect(durationExpression('una hora y media')).toBe(90);
    expect(durationExpression('90 minutos')).toBe(90);
  });
  it('no inventa hora/duración y escoge capacidad suficiente en código', () => {
    const patch = {
      participants: 6,
      dateReference: dateExpression('sábado')!,
      period: 'morning' as const,
      serviceCodes: ['projector' as const],
    };
    const initial = planSlots({}, patch, rooms, now);
    expect(initial.question).toContain('hora exacta');
    expect(initial.slots).toMatchObject({ roomId: rooms[1]!.id, date: '2026-10-24' });
    expect(initial.slots.startTime).toBeUndefined();
    expect(initial.slots.durationMinutes).toBeUndefined();
    const next = planSlots(initial.slots, { startTime: '09:00' }, rooms, now);
    expect(next.question).toContain('Cuánto tiempo');
    expect(planSlots(next.slots, { durationMinutes: 120 }, rooms, now).question).toBeNull();
    const reloaded = planSlots(initial.slots, {}, rooms, new Date('2026-10-31T12:00:00Z'));
    expect(reloaded.slots.date).toBe('2026-10-24');
  });
  it('exige extras explícitos y no ofrece sala insuficiente', () => {
    expect(planSlots({}, { participants: 100 }, rooms, now).question).toContain('sala suficiente');
    const planned = planSlots(
      {},
      {
        participants: 2,
        dateReference: dateExpression('mañana')!,
        startTime: '09:00',
        durationMinutes: 60,
      },
      rooms,
      now,
    );
    expect(planned.question).toContain('extras');
    expect(planSlots(planned.slots, { serviceCodes: [] }, rooms, now).question).toBeNull();
  });
  it('exige cita literal, correspondencia del valor y sala real, no solo una subcadena', () => {
    const good: AssistantExtraction = {
      intent: 'booking_request',
      patch: { participants: 6 },
      evidence: { participants: '6 personas' },
    };
    expect(validateExtraction(good, 'Somos 6 personas', rooms)).toEqual(good);
    for (const bad of [
      { ...good, patch: { participants: 8 } },
      { ...good, evidence: { participants: '8 personas' } },
      {
        ...good,
        patch: { roomId: '00000000-0000-4000-8000-000000000999' },
        evidence: { roomId: '6 personas' },
      },
      { ...good, patch: { startTime: '09:00' }, evidence: { startTime: '6 personas' } },
      {
        ...good,
        patch: { serviceCodes: ['projector'] },
        evidence: { serviceCodes: 'sin proyector' },
      },
      {
        ...good,
        patch: { dateReference: { kind: 'absolute', date: '2026-10-24' } },
        evidence: { dateReference: 'mañana' },
      },
    ])
      expect(() =>
        validateExtraction(bad, 'Somos 6 personas mañana sin proyector', rooms),
      ).toThrow();
  });
  it('esquema estricto excluye precio, disponibilidad, herramientas y permisos', () => {
    const empty = { intent: 'booking_request', patch: {}, evidence: {} };
    for (const extra of [
      { price: 1 },
      { available: true },
      { tool: 'confirm' },
      { ownerId: rooms[0]!.id },
    ])
      expect(assistantExtractionSchema.safeParse({ ...empty, ...extra }).success).toBe(false);
    for (const patch of [{ price: 1 }, { action: 'confirm' }, { customerId: rooms[0]!.id }])
      expect(assistantExtractionSchema.safeParse({ ...empty, patch }).success).toBe(false);
  });
  it('una cita parcial no convierte un periodo en fecha, una duración en personas ni omite una negación', () => {
    const bad = [
      {
        content: 'en la mañana',
        patch: { dateReference: { kind: 'relative_day', offsetDays: 1 } },
        evidence: { dateReference: 'mañana' },
      },
      { content: '6 horas', patch: { participants: 6 }, evidence: { participants: '6' } },
      {
        content: 'sin proyector',
        patch: { serviceCodes: ['projector'] },
        evidence: { serviceCodes: 'proyector' },
      },
    ];
    for (const item of bad)
      expect(() =>
        validateExtraction(
          { intent: 'booking_request', patch: item.patch, evidence: item.evidence },
          item.content,
          rooms,
        ),
      ).toThrow();
    expect(dateExpression('mañana por la mañana')).toEqual({ kind: 'relative_day', offsetDays: 1 });
  });
});
describe('Adaptador Gemini: contrato de red sin llamadas externas de tests', () => {
  it('falta de clave/modelo es recuperable, sin exponer configuración', async () => {
    await expect(
      createLlmClient({}).extract({ content: 'hola', slots: {}, history: [], rooms }),
    ).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
  });
  it('SDK envía extracción estructurada, sin herramientas ni tarifas', async () => {
    const value = { intent: 'booking_request', patch: {}, evidence: {} };
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { role: 'model', parts: [{ text: JSON.stringify(value) }] },
                finishReason: 'STOP',
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(
      await new GeminiClient('test-key', 'gemini-3.8-flash').extract({
        content: 'hola',
        slots: {},
        history: [],
        rooms,
      }),
    ).toEqual(value);
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(request[1].body));
    expect(body.tools).toBeUndefined();
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
    expect(String(request[1].body)).not.toContain('hourlyRate');
    expect(String(request[1].body)).not.toContain('test-key');
  });
  it('error externo, JSON inválido o salida enorme no filtran el error del proveedor', async () => {
    for (const text of ['no JSON', 'x'.repeat(16001)]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      );
      await expect(
        new GeminiClient('secret-test', 'gemini-3.8-flash').extract({
          content: 'hola',
          slots: {},
          history: [],
          rooms,
        }),
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('secret-test');
      }),
    );
    await expect(
      new GeminiClient('secret-test', 'gemini-3.8-flash').extract({
        content: 'hola',
        slots: {},
        history: [],
        rooms,
      }),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });
});
