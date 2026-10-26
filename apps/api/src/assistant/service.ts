import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  assistantSlotsSchema,
  chatCreateSchema,
  chatInputSchema,
  conversationSchema,
  TIME_ZONE,
  type AssistantExtraction,
  type ChatCard,
  type ChatInput,
  type Conversation,
} from '@lumni/shared';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema.js';
import { chatConversations, chatMessages, users, rooms, bookings } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { BookingService, serializeBooking } from '../bookings/service.js';
import { QuoteService } from '../quotes/service.js';
import { ambiguity } from './dates.js';
import { validateExtraction } from './evidence.js';
import { planSlots, restricted } from './planner.js';
import type { LlmClient } from './llm.js';

type ConversationRow = typeof chatConversations.$inferSelect;
type Db = NodePgDatabase<typeof schema>;
const canonicalContent = (input: ChatInput) =>
  input.kind === 'message' ? input.content : 'Aceptar la alternativa propuesta';
export class AssistantService {
  private readonly activeOwners = new Set<string>();
  private readonly recentAttempts = new Map<string, number[]>();
  constructor(
    private readonly database: Database,
    private readonly llm: LlmClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async own(db: Db, ownerId: string, id: string): Promise<ConversationRow> {
    const [row] = await db
      .select()
      .from(chatConversations)
      .where(and(eq(chatConversations.id, id), eq(chatConversations.ownerId, ownerId)));
    if (!row) throw new HttpError(404, 'CHAT_NOT_FOUND', 'No encontramos esa conversación');
    return row;
  }
  private async serialize(db: Db, row: ConversationRow): Promise<Conversation> {
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, row.id))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
    return conversationSchema.parse({
      id: row.id,
      version: row.version,
      slots: row.slots,
      draftBookingId: row.draftBookingId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        clientMessageId: m.clientMessageId,
        kind:
          m.role === 'user' ? (m.cardData as { requestKind: ChatInput['kind'] }).requestKind : null,
        card: m.role === 'assistant' ? m.cardData : null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  }
  async create(ownerId: string, value: unknown) {
    const input = chatCreateSchema.parse(value);
    const [row] = await this.database.db
      .insert(chatConversations)
      .values({ ownerId, clientRequestId: input.clientRequestId })
      .onConflictDoNothing({
        target: [chatConversations.ownerId, chatConversations.clientRequestId],
      })
      .returning();
    const stored =
      row ??
      (
        await this.database.db
          .select()
          .from(chatConversations)
          .where(
            and(
              eq(chatConversations.ownerId, ownerId),
              eq(chatConversations.clientRequestId, input.clientRequestId),
            ),
          )
      )[0];
    if (!stored) throw new Error('No se pudo recuperar la conversación');
    return this.get(ownerId, stored.id);
  }
  async list(ownerId: string) {
    return this.database.db
      .select({
        id: chatConversations.id,
        draftBookingId: chatConversations.draftBookingId,
        updatedAt: chatConversations.updatedAt,
      })
      .from(chatConversations)
      .where(eq(chatConversations.ownerId, ownerId))
      .orderBy(desc(chatConversations.updatedAt), desc(chatConversations.id))
      .limit(20)
      .then((rows) => rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })));
  }
  async get(ownerId: string, id: string) {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const db = drizzle(client, { schema });
      const result = await this.serialize(db, await this.own(db, ownerId, id));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private replay(conversation: Conversation, input: ChatInput) {
    const prior = conversation.messages.find((m) => m.clientMessageId === input.clientMessageId);
    if (!prior) return false;
    // El usuario no puede usar el texto reservado del botón para cambiar la intención de un replay.
    if (prior.content !== canonicalContent(input) || prior.kind !== input.kind)
      throw new HttpError(
        409,
        'CHAT_IDEMPOTENCY_CONFLICT',
        'Ese mensaje ya se usó con otro contenido',
      );
    return true;
  }
  async message(ownerId: string, id: string, value: unknown) {
    const input = chatInputSchema.parse(value);
    const before = await this.get(ownerId, id);
    if (this.replay(before, input)) return before;
    if (before.version !== input.expectedVersion) throw this.versionConflict();
    if (before.messages.length >= 80)
      throw new HttpError(
        429,
        'CHAT_LIMIT',
        'Esta conversación llegó a su límite. Puedes abrir una nueva o continuar con el formulario.',
      );
    if (this.activeOwners.has(ownerId))
      throw new HttpError(429, 'CHAT_BUSY', 'Espera a que termine el mensaje anterior');
    const attemptedAt = this.now().getTime();
    for (const [owner, timestamps] of this.recentAttempts) {
      const recent = timestamps.filter((timestamp) => timestamp > attemptedAt - 60000);
      if (recent.length) this.recentAttempts.set(owner, recent);
      else this.recentAttempts.delete(owner);
    }
    const recent = this.recentAttempts.get(ownerId) ?? [];
    if (recent.length >= 10)
      throw new HttpError(
        429,
        'CHAT_RATE_LIMIT',
        'Has enviado varios mensajes seguidos. Espera un minuto para continuar.',
      );
    // También limita fallos del proveedor, sin insertar mensajes ni alterar slots.
    this.recentAttempts.set(ownerId, [...recent, attemptedAt]);
    this.activeOwners.add(ownerId);
    try {
      const [rate] = await this.database.db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
        .where(
          and(
            eq(chatConversations.ownerId, ownerId),
            eq(chatMessages.role, 'user'),
            sql`${chatMessages.createdAt} > ${new Date(this.now().getTime() - 60000)}`,
          ),
        );
      if ((rate?.count ?? 0) >= 10)
        throw new HttpError(
          429,
          'CHAT_RATE_LIMIT',
          'Has enviado varios mensajes seguidos. Espera un minuto para continuar.',
        );
      const catalog = await this.database.db
        .select({ id: rooms.id, name: rooms.name, size: rooms.size, capacity: rooms.capacity })
        .from(rooms);
      const text = canonicalContent(input);
      let answer: string | null = null;
      let extraction: AssistantExtraction | null = null;
      if (input.kind === 'message') {
        answer = restricted(text)
          ? 'Puedo ayudarte a preparar tu propia reserva. La confirmación y la cancelación se realizan desde los botones de la aplicación, según tus permisos.'
          : ambiguity(text);
        if (!answer) {
          // No hay conexión ni transacción PG retenida durante esta llamada.
          extraction = validateExtraction(
            await this.llm.extract({
              content: text,
              slots: before.slots,
              history: before.messages.slice(-6).map(({ role, content }) => ({ role, content })),
              rooms: catalog,
            }),
            text,
            catalog,
          );
          if (extraction.intent === 'unrelated')
            answer =
              'Puedo ayudarte a buscar una sala y preparar un borrador. ¿Para cuántas personas necesitas el espacio?';
        }
      }
      const client = await this.database.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout='5s'");
        const db = drizzle(client, { schema });
        const [locked] = await db
          .select()
          .from(chatConversations)
          .where(and(eq(chatConversations.id, id), eq(chatConversations.ownerId, ownerId)))
          .for('update');
        if (!locked) throw new HttpError(404, 'CHAT_NOT_FOUND', 'No encontramos esa conversación');
        const latest = await this.serialize(db, locked);
        if (this.replay(latest, input)) {
          await client.query('COMMIT');
          return latest;
        }
        if (locked.version !== input.expectedVersion) throw this.versionConflict();
        let slots = assistantSlotsSchema.parse(locked.slots);
        let card: ChatCard | null = null;
        let draftBookingId = locked.draftBookingId;
        if (!answer) {
          if (draftBookingId) {
            const [linked] = await db
              .select({ status: bookings.status })
              .from(bookings)
              .where(and(eq(bookings.id, draftBookingId), eq(bookings.ownerId, ownerId)))
              .for('update');
            if (!linked || linked.status !== 'draft')
              throw new HttpError(
                409,
                'CHAT_DRAFT_FINALIZED',
                'La reserva ya cambió de estado. Abre otra conversación para una reserva nueva.',
              );
          }
          let patch = extraction?.patch ?? {};
          if (input.kind === 'accept_alternative') {
            const last = latest.messages.at(-1)?.card;
            if (!last || last.quote.canBook || !last.quote.suggestedSlot)
              throw new HttpError(
                409,
                'CHAT_NO_ALTERNATIVE',
                'No hay una alternativa vigente para aceptar',
              );
            const start = DateTime.fromISO(last.quote.suggestedSlot.startsAt).setZone(TIME_ZONE);
            patch = {
              dateReference: { kind: 'absolute', date: start.toISODate()! },
              startTime: start.toFormat('HH:mm'),
            };
          }
          const planned = planSlots(slots, patch, catalog, this.now());
          slots = planned.slots;
          answer = planned.question;
          if (!answer) {
            const quote = await new QuoteService({ db }, this.now).quote({
              roomId: slots.roomId,
              date: slots.date,
              startTime: slots.startTime,
              durationMinutes: slots.durationMinutes,
              serviceCodes: slots.serviceCodes,
            });
            if (quote.canBook) {
              // El único escritor del asistente recibe un cliente de transacción y datos de sesión.
              const writer: Pick<BookingService, 'create' | 'save'> = new BookingService(
                this.database,
                this.now,
                client,
              );
              let draft;
              if (draftBookingId) {
                const [row] = await db
                  .select()
                  .from(bookings)
                  .where(and(eq(bookings.id, draftBookingId), eq(bookings.ownerId, ownerId)))
                  .for('update');
                if (!row || row.status !== 'draft')
                  throw new HttpError(
                    409,
                    'CHAT_DRAFT_FINALIZED',
                    'La reserva ya cambió de estado. Abre otra conversación para una reserva nueva.',
                  );
                if (row.version !== slots.draftVersion)
                  throw new HttpError(
                    409,
                    'CHAT_DRAFT_CHANGED',
                    'Editaste el borrador desde el formulario. Continúa allí o abre otra conversación para no sobrescribirlo.',
                  );
                draft = serializeBooking(row);
              } else {
                const [profile] = await db
                  .select({ fullName: users.fullName, email: users.email })
                  .from(users)
                  .where(eq(users.id, ownerId));
                if (!profile) throw new HttpError(401, 'SESSION_EXPIRED', 'Vuelve a ingresar');
                draft = await writer.create(ownerId, { clientRequestId: id, customer: profile });
              }
              draft = await writer.save(ownerId, draft.id, {
                step: 2,
                expectedVersion: draft.version,
                roomId: slots.roomId,
                date: slots.date,
                startTime: slots.startTime,
                durationMinutes: slots.durationMinutes,
              });
              draft = await writer.save(ownerId, draft.id, {
                step: 3,
                expectedVersion: draft.version,
                serviceCodes: slots.serviceCodes,
              });
              draftBookingId = draft.id;
              slots.draftVersion = draft.version;
              // La tarjeta usa el snapshot que quedó guardado por el servicio de reservas.
              if (!draft.quoteSnapshot) throw new Error('Snapshot de borrador ausente');
              card = {
                quote: draft.quoteSnapshot,
                roomName: catalog.find((r) => r.id === slots.roomId)!.name,
                draftBookingId,
              };
              answer =
                'Preparé tu borrador con esta cotización. Revisa sus datos en el formulario; solo allí puedes confirmar. La cotización no bloquea el horario.';
            } else {
              card = {
                quote,
                roomName: catalog.find((r) => r.id === slots.roomId)!.name,
                draftBookingId: null,
              };
              answer =
                quote.reasonCode === 'PAST'
                  ? 'Ese horario ya pasó. ¿Qué fecha exacta quieres usar? No cambiaré la semana por mi cuenta.'
                  : quote.suggestedSlot
                    ? 'Ese horario no está disponible. Puedes revisar la alternativa del cotizador; solo la usaré si la aceptas.'
                    : 'El cotizador no permite reservar ese horario y no encontró alternativa. ¿Qué otra fecha quieres consultar?';
            }
          }
        }
        const lastTime = latest.messages.at(-1)?.createdAt;
        const userAt = new Date(
          Math.max(this.now().getTime(), lastTime ? Date.parse(lastTime) + 1 : 0),
        );
        await db.insert(chatMessages).values([
          {
            id: randomUUID(),
            conversationId: id,
            clientMessageId: input.clientMessageId,
            role: 'user',
            content: text,
            cardData: { requestKind: input.kind },
            createdAt: userAt,
          },
          {
            id: randomUUID(),
            conversationId: id,
            role: 'assistant',
            content: answer!,
            cardData: card,
            createdAt: new Date(userAt.getTime() + 1),
          },
        ]);
        const [saved] = await db
          .update(chatConversations)
          .set({ slots, draftBookingId, version: locked.version + 1, updatedAt: this.now() })
          .where(
            and(eq(chatConversations.id, id), eq(chatConversations.version, input.expectedVersion)),
          )
          .returning();
        if (!saved) throw this.versionConflict();
        const result = await this.serialize(db, saved);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } finally {
      this.activeOwners.delete(ownerId);
    }
  }
  private versionConflict() {
    return new HttpError(
      409,
      'CHAT_VERSION_CONFLICT',
      'La conversación cambió en otra pestaña. Actualízala antes de enviar otra vez.',
    );
  }
}
