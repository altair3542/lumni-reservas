import { z } from 'zod';
import { dateSchema, durationSchema, serviceCodesSchema, startTimeSchema, uuidSchema } from './contracts.js';
export const dateReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('absolute'), date: dateSchema }).strict(),
  z.object({ kind: z.literal('relative_day'), offsetDays: z.union([z.literal(0), z.literal(1), z.literal(2)]) }).strict(),
  z.object({ kind: z.literal('weekday'), isoWeekday: z.number().int().min(1).max(7), relation: z.enum(['next_or_today', 'following_week']) }).strict(),
]);
export const assistantPatchSchema = z.object({
  participants: z.number().int().min(1).max(100).optional(), roomId: uuidSchema.optional(),
  dateReference: dateReferenceSchema.optional(), startTime: startTimeSchema.optional(),
  period: z.enum(['morning', 'afternoon', 'evening']).optional(),
  durationMinutes: durationSchema.optional(), serviceCodes: serviceCodesSchema.optional(),
}).strict();
export const assistantExtractionSchema = z.object({
  intent: z.enum(['booking_request', 'unrelated']), patch: assistantPatchSchema,
  evidence: z.record(z.string(), z.string().min(1).max(1000)),
}).strict().superRefine((v, ctx) => {
  const fields = Object.keys(v.patch).sort();
  if (JSON.stringify(fields) !== JSON.stringify(Object.keys(v.evidence).sort()))
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'Exige evidencia exactamente para cada campo de patch' });
  if (v.intent === 'unrelated' && fields.length)
    ctx.addIssue({ code: 'custom', path: ['patch'], message: 'Intención ajena sin datos de reserva' });
});
// A6 validará además citas contra el mensaje, catálogo y valores extraídos en código.
export type AssistantExtraction = z.infer<typeof assistantExtractionSchema>;
