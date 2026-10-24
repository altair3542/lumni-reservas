import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  AssistantExtraction,
  Customer,
  EmailPayload,
  Quote,
  ServiceCode,
} from '@lumni/shared';
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
export const userRole = pgEnum('user_role', ['client', 'admin']);
export const roomSize = pgEnum('room_size', ['small', 'medium', 'large']);
export const bookingStatus = pgEnum('booking_status', [
  'draft',
  'confirmed',
  'completed',
  'cancelled',
]);
export const emailStatus = pgEnum('email_status', ['pending', 'sent', 'failed']);
export const messageRole = pgEnum('message_role', ['user', 'assistant']);
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull(),
    fullName: text('full_name').notNull(),
  },
  (t) => [check('users_email_normalized', sql`${t.email} = lower(btrim(${t.email}))`)],
);
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (t) => [index('sessions_expires_idx').on(t.expiresAt), index('sessions_user_idx').on(t.userId)],
);
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    size: roomSize('size').notNull().unique(),
    capacity: integer('capacity').notNull(),
    hourlyRateCop: integer('hourly_rate_cop').notNull(),
  },
  (t) => [
    check('rooms_capacity_positive', sql`${t.capacity} > 0`),
    check('rooms_rate_positive', sql`${t.hourlyRateCop} > 0`),
  ],
);
export const services = pgTable(
  'services',
  {
    code: text('code').$type<ServiceCode>().primaryKey(),
    name: text('name').notNull(),
    flatPriceCop: integer('flat_price_cop').notNull(),
  },
  (t) => [
    check('services_code_known', sql`${t.code} IN ('projector','coffee')`),
    check('services_price_nonnegative', sql`${t.flatPriceCop} >= 0`),
  ],
);
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    clientRequestId: uuid('client_request_id').notNull(),
    createRequestHash: text('create_request_hash').notNull(),
    status: bookingStatus('status').default('draft').notNull(),
    wizardStep: integer('wizard_step').default(1).notNull(),
    version: integer('version').default(1).notNull(),
    customer: jsonb('customer').$type<Partial<Customer>>(),
    roomId: uuid('room_id').references(() => rooms.id),
    startsAt: instant('starts_at'),
    endsAt: instant('ends_at'),
    serviceCodes: jsonb('service_codes').$type<ServiceCode[]>(),
    quoteSnapshot: jsonb('quote_snapshot').$type<Quote>(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    confirmedAt: instant('confirmed_at'),
    cancelledAt: instant('cancelled_at'),
    cancellationReason: text('cancellation_reason'),
  },
  (t) => [
    unique('bookings_owner_request_unique').on(t.ownerId, t.clientRequestId),
    index('bookings_owner_status_idx').on(t.ownerId, t.status),
    index('bookings_room_status_idx').on(t.roomId, t.status),
    index('bookings_admin_order_idx').on(t.createdAt, t.id),
    check('bookings_version_positive', sql`${t.version} > 0`),
    check('bookings_step_range', sql`${t.wizardStep} BETWEEN 1 AND 3`),
    check(
      'bookings_positive_range',
      sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`,
    ),
    check(
      'bookings_confirmed_complete',
      sql`${t.status} NOT IN ('confirmed','completed') OR (
    ${t.roomId} IS NOT NULL AND ${t.startsAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL
    AND ${t.quoteSnapshot} IS NOT NULL AND ${t.serviceCodes} IS NOT NULL AND ${t.confirmedAt} IS NOT NULL
    AND coalesce(length(btrim(${t.customer}->>'fullName')) > 0, false)
    AND coalesce(length(btrim(${t.customer}->>'email')) > 0, false))`,
    ),
    check(
      'bookings_cancelled_reason',
      sql`${t.status} <> 'cancelled' OR (${t.cancelledAt} IS NOT NULL AND coalesce(length(btrim(${t.cancellationReason})) > 0, false))`,
    ),
  ],
);
export const bookingLines = pgTable(
  'booking_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    concept: text('concept').notNull(),
    amountCop: integer('amount_cop').notNull(),
  },
  (t) => [unique('booking_lines_concept_unique').on(t.bookingId, t.concept)],
);
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id),
    dedupKey: text('dedup_key').notNull().unique(),
    payload: jsonb('payload').$type<EmailPayload>().notNull(),
    status: emailStatus('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: instant('next_attempt_at').defaultNow().notNull(),
    lastError: text('last_error'),
    sentAt: instant('sent_at'),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('email_outbox_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
    check('email_attempts_range', sql`${t.attempts} BETWEEN 0 AND 6`),
  ],
);
export const capturedEmails = pgTable('captured_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  dedupKey: text('dedup_key').notNull().unique(),
  bookingId: uuid('booking_id')
    .notNull()
    .unique()
    .references(() => bookings.id),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  textBody: text('text_body').notNull(),
  htmlBody: text('html_body'),
  capturedAt: instant('captured_at').defaultNow().notNull(),
});
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    clientRequestId: uuid('client_request_id').notNull(),
    version: integer('version').default(1).notNull(),
    slots: jsonb('slots').$type<AssistantExtraction['patch']>().default({}).notNull(),
    draftBookingId: uuid('draft_booking_id')
      .unique()
      .references(() => bookings.id),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
  },
  (t) => [
    unique('chat_owner_request_unique').on(t.ownerId, t.clientRequestId),
    check('chat_version_positive', sql`${t.version} > 0`),
  ],
);
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    clientMessageId: uuid('client_message_id'),
    role: messageRole('role').notNull(),
    content: text('content').notNull(),
    cardData: jsonb('card_data'),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('chat_client_message_unique')
      .on(t.conversationId, t.clientMessageId)
      .where(sql`${t.role} = 'user'`),
    index('chat_message_order_idx').on(t.conversationId, t.createdAt, t.id),
  ],
);
