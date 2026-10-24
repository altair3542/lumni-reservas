import { DateTime } from 'luxon';
import { z } from 'zod';

export const TIME_ZONE = 'America/Bogota' as const;
export const currencySchema = z.literal('COP');
export const uuidSchema = z.uuid();
export const bookingStatusSchema = z.enum(['draft', 'confirmed', 'completed', 'cancelled']);
export const roleSchema = z.enum(['client', 'admin']);
export const roomSizeSchema = z.enum(['small', 'medium', 'large']);
export const serviceCodeSchema = z.enum(['projector', 'coffee']);
export const serviceCodesSchema = z
  .array(serviceCodeSchema)
  .max(2)
  .refine((v) => new Set(v).size === v.length, 'No repitas servicios');
export const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const versionSchema = z.number().int().positive();
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v, { zone: TIME_ZONE }).isValid, 'Fecha inválida');
export const startTimeSchema = z.string().regex(/^([01]\d|2[0-3]):(00|30)$/);
export const durationSchema = z.number().int().min(60).max(600).multipleOf(30);
export const instantSchema = z.iso.datetime({ offset: true });
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const userSchema = z
  .object({ id: uuidSchema, email: emailSchema, fullName: z.string().min(1), role: roleSchema })
  .strict();
export const loginResponseSchema = z.object({ user: userSchema }).strict();
export const customerSchema = z
  .object({
    fullName: z.string().trim().min(1).max(160),
    email: emailSchema,
    company: z.string().trim().max(160).optional(),
  })
  .strict();
export const roomSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    size: roomSizeSchema,
    capacity: z.number().int().positive(),
    hourlyRateCop: moneySchema,
  })
  .strict();
export const serviceSchema = z
  .object({ code: serviceCodeSchema, name: z.string(), flatPriceCop: moneySchema })
  .strict();
export const quoteRequestSchema = z
  .object({
    roomId: uuidSchema,
    date: dateSchema,
    startTime: startTimeSchema,
    durationMinutes: durationSchema,
    serviceCodes: serviceCodesSchema.default([]),
  })
  .strict();
export const breakdownSchema = z
  .object({
    base: moneySchema,
    discount: moneySchema,
    surcharge: moneySchema,
    services: moneySchema,
    total: moneySchema,
  })
  .strict()
  .refine(
    (v) => v.total === v.base - v.discount + v.surcharge + v.services,
    'Desglose inconsistente',
  );
export const slotSchema = z
  .object({ startsAt: instantSchema, endsAt: instantSchema })
  .strict()
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), 'Intervalo inválido');
export const quoteReasonCodeSchema = z.enum([
  'CLOSED_SUNDAY',
  'PAST',
  'OUTSIDE_HOURS',
  'ROOM_UNAVAILABLE',
]);
export const quoteSchema = z
  .object({
    roomId: uuidSchema,
    startsAt: instantSchema,
    endsAt: instantSchema,
    timeZone: z.literal(TIME_ZONE),
    currency: currencySchema,
    pricingVersion: z.literal('v1'),
    breakdown: breakdownSchema,
    canBook: z.boolean(),
    reasonCode: quoteReasonCodeSchema.nullable(),
    message: z.string().nullable(),
    suggestedSlot: slotSchema.nullable(),
  })
  .strict()
  .refine(
    (v) =>
      v.canBook
        ? v.reasonCode === null && v.message === null && v.suggestedSlot === null
        : v.reasonCode !== null && !!v.message,
    'Estado de disponibilidad inconsistente',
  );
export const createDraftSchema = z
  .object({ clientRequestId: uuidSchema, customer: customerSchema.partial().optional() })
  .strict();
export const draftStepSchema = z.discriminatedUnion('step', [
  z
    .object({ step: z.literal(1), expectedVersion: versionSchema, customer: customerSchema })
    .strict(),
  z
    .object({
      step: z.literal(2),
      expectedVersion: versionSchema,
      roomId: uuidSchema,
      date: dateSchema,
      startTime: startTimeSchema,
      durationMinutes: durationSchema,
    })
    .strict(),
  z
    .object({
      step: z.literal(3),
      expectedVersion: versionSchema,
      serviceCodes: serviceCodesSchema,
    })
    .strict(),
]);
export const confirmSchema = z.object({ expectedVersion: versionSchema }).strict();
export const cancelSchema = confirmSchema
  .extend({ reason: z.string().trim().min(1).max(1000) })
  .strict();
const positiveQuery = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive());
export const paginationSchema = z
  .object({
    page: positiveQuery.default(1),
    pageSize: positiveQuery.pipe(z.number().max(100)).default(20),
  })
  .strict();
export const adminBookingQuerySchema = paginationSchema
  .extend({ status: bookingStatusSchema.optional(), roomId: uuidSchema.optional() })
  .strict();
export const emailStatusSchema = z.enum(['pending', 'sent', 'failed']);
export const emailQueueItemSchema = z
  .object({
    id: uuidSchema,
    bookingId: uuidSchema,
    status: emailStatusSchema,
    attempts: z.number().int().min(0).max(6),
    lastError: z.string().nullable(),
    capturedEmailId: uuidSchema.nullable(),
    nextAttemptAt: instantSchema,
    sentAt: instantSchema.nullable(),
  })
  .strict();
export const emailPayloadSchema = z
  .object({
    toEmail: emailSchema,
    subject: z.string().min(1).max(300),
    textBody: z.string().min(1).max(20000),
    htmlBody: z.string().max(30000).optional(),
  })
  .strict();
export const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
        requestId: uuidSchema,
      })
      .strict(),
  })
  .strict();
export type User = z.infer<typeof userSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type ServiceCode = z.infer<typeof serviceCodeSchema>;
export type EmailPayload = z.infer<typeof emailPayloadSchema>;

export const healthSchema = z
  .object({ status: z.literal('ok'), database: z.literal('up') })
  .strict();
export const roomListSchema = z.object({ items: z.array(roomSchema) }).strict();
export const serviceListSchema = z.object({ items: z.array(serviceSchema) }).strict();

export const bookingSchema = z
  .object({
    id: uuidSchema,
    ownerId: uuidSchema,
    status: bookingStatusSchema,
    wizardStep: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    version: versionSchema,
    customer: customerSchema.partial().nullable(),
    roomId: uuidSchema.nullable(),
    startsAt: instantSchema.nullable(),
    endsAt: instantSchema.nullable(),
    serviceCodes: serviceCodesSchema.nullable(),
    quoteSnapshot: quoteSchema.nullable(),
    createdAt: instantSchema,
    confirmedAt: instantSchema.nullable(),
    cancelledAt: instantSchema.nullable(),
    cancellationReason: z.string().nullable(),
  })
  .strict();
export const bookingResponseSchema = z.object({ booking: bookingSchema }).strict();
export const adminBookingPageSchema = z
  .object({
    items: z.array(bookingSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
  })
  .strict();
export const emailQueueQuerySchema = paginationSchema
  .extend({ status: emailStatusSchema.optional() })
  .strict();
export const emailQueuePageSchema = z
  .object({
    items: z.array(emailQueueItemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
  })
  .strict();
export type Booking = z.infer<typeof bookingSchema>;
