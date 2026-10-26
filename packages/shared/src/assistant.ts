import { z } from 'zod';
import {
  dateSchema,
  durationSchema,
  serviceCodesSchema,
  startTimeSchema,
  uuidSchema,
  quoteSchema,
  versionSchema,
  instantSchema,
} from './contracts.js';
export const dateReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('absolute'), date: dateSchema }).strict(),
  z
    .object({
      kind: z.literal('relative_day'),
      offsetDays: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('weekday'),
      isoWeekday: z.number().int().min(1).max(7),
      relation: z.enum(['next_or_today', 'following_week']),
    })
    .strict(),
]);
export const assistantPatchSchema = z
  .object({
    participants: z.number().int().min(1).max(100).optional(),
    roomId: uuidSchema.optional(),
    dateReference: dateReferenceSchema.optional(),
    startTime: startTimeSchema.optional(),
    period: z.enum(['morning', 'afternoon', 'evening']).optional(),
    durationMinutes: durationSchema.optional(),
    serviceCodes: serviceCodesSchema.optional(),
  })
  .strict();
export const assistantExtractionSchema = z
  .object({
    intent: z.enum(['booking_request', 'unrelated']),
    patch: assistantPatchSchema,
    evidence: z.record(z.string(), z.string().min(1).max(1000)),
  })
  .strict()
  .superRefine((v, ctx) => {
    const fields = Object.keys(v.patch).sort();
    if (JSON.stringify(fields) !== JSON.stringify(Object.keys(v.evidence).sort()))
      ctx.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Exige evidencia exactamente para cada campo de patch',
      });
    if (v.intent === 'unrelated' && fields.length)
      ctx.addIssue({
        code: 'custom',
        path: ['patch'],
        message: 'Intención ajena sin datos de reserva',
      });
  });
export const assistantSlotsSchema = assistantPatchSchema
  .extend({
    date: dateSchema.optional(),
    draftVersion: versionSchema.optional(),
  })
  .strict();
export const chatCreateSchema = z.object({ clientRequestId: uuidSchema }).strict();
const messageBase = { clientMessageId: uuidSchema, expectedVersion: versionSchema };
export const chatInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...messageBase,
      kind: z.literal('message'),
      content: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z.object({ ...messageBase, kind: z.literal('accept_alternative') }).strict(),
]);
export const chatCardSchema = z
  .object({
    quote: quoteSchema,
    roomName: z.string().min(1),
    draftBookingId: uuidSchema.nullable(),
  })
  .strict();
export const chatMessageSchema = z
  .object({
    id: uuidSchema,
    role: z.enum(['user', 'assistant']),
    kind: z.enum(['message', 'accept_alternative']).nullable(),
    content: z.string().max(2000),
    clientMessageId: uuidSchema.nullable(),
    card: chatCardSchema.nullable(),
    createdAt: instantSchema,
  })
  .strict();
export const conversationSchema = z
  .object({
    id: uuidSchema,
    version: versionSchema,
    slots: assistantSlotsSchema,
    draftBookingId: uuidSchema.nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
    messages: z.array(chatMessageSchema).max(80),
  })
  .strict();
export const conversationResponseSchema = z.object({ conversation: conversationSchema }).strict();
export const conversationListSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: uuidSchema,
            updatedAt: instantSchema,
            draftBookingId: uuidSchema.nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type AssistantSlots = z.infer<typeof assistantSlotsSchema>;
export type ChatInput = z.infer<typeof chatInputSchema>;
export type ChatCard = z.infer<typeof chatCardSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type AssistantExtraction = z.infer<typeof assistantExtractionSchema>;
