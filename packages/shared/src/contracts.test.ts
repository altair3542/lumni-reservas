import { describe, expect, it } from 'vitest';
import { assistantExtractionSchema, adminBookingQuerySchema, breakdownSchema, cancelSchema, confirmSchema, createDraftSchema, draftStepSchema, errorResponseSchema, loginSchema, quoteRequestSchema, slotSchema } from './index.js';
const id = '00000000-0000-4000-8000-000000000201';
const quote = { roomId: id, date: '2026-10-24', startTime: '09:00', durationMinutes: 60 };
describe('Contratos de frontera compartidos', () => {
  it('normaliza el correo y rechaza roles/precios inyectados', () => {
    expect(loginSchema.parse({ email: ' Cliente@Example.com ', password: 'secret' }).email).toBe('cliente@example.com');
    expect(loginSchema.safeParse({ email: 'cliente@example.com', password: 'secret', role: 'admin' }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...quote, total: 1 }).success).toBe(false);
  });
  it.each([0, 30, 59, 61, 630, 90.5, '60'])('rechaza duración inválida %s sin coerción', durationMinutes => {
    expect(quoteRequestSchema.safeParse({ ...quote, durationMinutes }).success).toBe(false);
  });
  it('acepta extremos y bloques de 30; rechaza fechas imposibles y horas fuera de rejilla', () => {
    for (const durationMinutes of [60, 90, 600]) expect(quoteRequestSchema.parse({ ...quote, durationMinutes }).durationMinutes).toBe(durationMinutes);
    for (const date of ['2026-02-30', '2026-13-01', '2026-1-2']) expect(quoteRequestSchema.safeParse({ ...quote, date }).success).toBe(false);
    for (const startTime of ['24:00', '09:15', '9:00']) expect(quoteRequestSchema.safeParse({ ...quote, startTime }).success).toBe(false);
  });
  it('admite un draft realmente parcial sin aceptar dueño ni estado', () => {
    expect(createDraftSchema.parse({ clientRequestId: id })).toEqual({ clientRequestId: id });
    expect(createDraftSchema.parse({ clientRequestId: id, customer: { fullName: 'Ana' } }).customer).toEqual({ fullName: 'Ana' });
    expect(createDraftSchema.safeParse({ clientRequestId: id, ownerId: id }).success).toBe(false);
    expect(draftStepSchema.safeParse({ step: 1, expectedVersion: 1, customer: { fullName: 'Ana' } }).success).toBe(false);
  });
  it('exige servicios explícitos en paso 3 y versión al confirmar', () => {
    expect(draftStepSchema.safeParse({ step: 3, expectedVersion: 1 }).success).toBe(false);
    expect(draftStepSchema.parse({ step: 3, expectedVersion: 1, serviceCodes: [] }).step).toBe(3);
    expect(draftStepSchema.safeParse({ step: 3, expectedVersion: 1, serviceCodes: ['coffee', 'coffee'] }).success).toBe(false);
    expect(confirmSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(confirmSchema.safeParse({ expectedVersion: 1, total: 1 }).success).toBe(false);
    expect(cancelSchema.safeParse({ expectedVersion: 1, reason: '   ' }).success).toBe(false);
  });
  it('pagina desde query strings sin aceptar cantidades fraccionarias, enormes o filtros ajenos', () => {
    expect(adminBookingQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(adminBookingQuerySchema.parse({ page: '2', pageSize: '100', status: 'draft', roomId: id }).page).toBe(2);
    for (const query of [{ page: '1.1' }, { pageSize: '101' }, { page: '0' }, { status: 'unknown' }, { ownerId: id }]) expect(adminBookingQuerySchema.safeParse(query).success).toBe(false);
  });
  it('valida dinero entero y consistencia del desglose', () => {
    expect(breakdownSchema.parse({ base: 160000, discount: 16000, surcharge: 36000, services: 20000, total: 200000 }).total).toBe(200000);
    expect(breakdownSchema.safeParse({ base: 1, discount: 0, surcharge: 0, services: 0, total: 2 }).success).toBe(false);
    expect(breakdownSchema.safeParse({ base: 1.5, discount: 0, surcharge: 0, services: 0, total: 1.5 }).success).toBe(false);
  });
  it('exige offsets y orden temporal positivo', () => {
    expect(slotSchema.safeParse({ startsAt: '2026-10-24T09:00:00', endsAt: '2026-10-24T10:00:00' }).success).toBe(false);
    expect(slotSchema.safeParse({ startsAt: '2026-10-24T09:00:00-05:00', endsAt: '2026-10-24T08:00:00-05:00' }).success).toBe(false);
  });
  it('impide capacidades privilegiadas o precios en extracción IA y exige evidencia exacta por campo', () => {
    const extraction = { intent: 'booking_request', patch: { participants: 6 }, evidence: { participants: '6 personas' } };
    expect(assistantExtractionSchema.safeParse(extraction).success).toBe(true);
    for (const patch of [{ confirm: true }, { total: 1 }, { available: true }, { ownerId: id }]) expect(assistantExtractionSchema.safeParse({ ...extraction, patch }).success).toBe(false);
    expect(assistantExtractionSchema.safeParse({ ...extraction, evidence: {} }).success).toBe(false);
    expect(assistantExtractionSchema.safeParse({ ...extraction, evidence: { participants: '6', roomId: id } }).success).toBe(false);
    expect(assistantExtractionSchema.safeParse({ ...extraction, intent: 'unrelated' }).success).toBe(false);
  });
  it('mantiene errores HTTP con requestId y sin campos desconocidos', () => {
    expect(errorResponseSchema.safeParse({ error: { code: 'INVALID_INPUT', message: 'Revisa', requestId: id } }).success).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: 'ERROR', message: 'Error', requestId: id, stack: 'private' } }).success).toBe(false);
  });
});
