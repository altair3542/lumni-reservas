import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { uuidSchema, type ChatInput, type ChatCard } from '@lumni/shared';
import { api } from '../lib/data.js';
import { fullDate, slotLabel } from '../lib/format.js';
import { ApiError } from '../api.js';
import {
  Availability,
  BackLink,
  Breakdown,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
} from '../components/Feedback.js';

export function ChatPage() {
  const { id } = useParams();
  if (!id) return <ConversationHome />;
  if (!uuidSchema.safeParse(id).success)
    return <Notice kind="error">La referencia de la conversación no es válida.</Notice>;
  return <ConversationView key={id} id={id} />;
}
function ConversationHome() {
  const list = useQuery({ queryKey: ['conversations'], queryFn: api.conversations, staleTime: 0 });
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const lock = useRef(false);
  async function create() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await api.createConversation(requestId.current);
      navigate(`/asistente/${result.conversation.id}`);
    } catch (error) {
      setError(error);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="TU PRÓXIMO ENCUENTRO" title="Cuéntanos qué necesitas." />
      <section className="card chat-intro">
        <span className="chat-orbit" aria-hidden="true">
          ✧
        </span>
        <h2>Hagamos espacio para tu idea.</h2>
        <p>
          Describe tu reunión y te ayudaré a elegir sala, horario y servicios. Revisarás el precio y
          confirmarás desde el formulario.
        </p>
        <p className="muted">
          Por ejemplo: «Una sala para seis personas el sábado en la mañana, con proyector».
        </p>
        <button
          className="button"
          disabled={pending}
          onClick={() => {
            void create();
          }}
        >
          {pending ? 'Preparando…' : 'Iniciar conversación →'}
        </button>
        <ErrorNotice error={error} />
      </section>
      <section className="card conversation-list">
        <h2>Retoma una conversación</h2>
        <ErrorNotice error={list.error} />
        {list.isPending ? (
          <Loading />
        ) : list.data?.items.length ? (
          <ul>
            {list.data.items.map((item) => (
              <li key={item.id}>
                <Link className="inline-link" to={`/asistente/${item.id}`}>
                  Conversación del {fullDate(item.updatedAt)} →
                </Link>
                {item.draftBookingId && <small>Borrador vinculado</small>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Tus conversaciones guardadas aparecerán aquí.</p>
        )}
        <button
          className="text-button"
          disabled={list.isFetching}
          onClick={() => {
            void list.refetch();
          }}
        >
          Actualizar conversaciones
        </button>
      </section>
    </>
  );
}
function ConversationView({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const chat = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.conversation(id),
    staleTime: 0,
  });
  const [content, setContent] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const retry = useRef<ChatInput | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const conversation = chat.data?.conversation;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [conversation?.messages.length]);
  async function send(kind: ChatInput['kind']) {
    if (lock.current || !conversation || (kind === 'message' && !content.trim())) return;
    const text = content.trim();
    const previous = retry.current;
    const same =
      previous?.kind === kind &&
      (previous.kind === 'accept_alternative' || previous.content === text);
    const input: ChatInput = same
      ? previous
      : kind === 'message'
        ? {
            kind,
            content: text,
            expectedVersion: conversation.version,
            clientMessageId: crypto.randomUUID(),
          }
        : { kind, expectedVersion: conversation.version, clientMessageId: crypto.randomUUID() };
    retry.current = input;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await api.chat(id, input);
      queryClient.setQueryData(['conversation', id], result);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (kind === 'message') setContent('');
      retry.current = null;
    } catch (error) {
      setError(error);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <BackLink to="/asistente">Conversaciones</BackLink>
      <PageHeading eyebrow="ASISTENTE DE RESERVAS" title="Un encuentro empieza conversando.">
        <button
          className="button secondary compact"
          disabled={pending || chat.isFetching}
          onClick={() => {
            retry.current = null;
            setError(null);
            void chat.refetch();
          }}
        >
          Actualizar conversación
        </button>
      </PageHeading>
      <p className="muted">
        Horario de Colombia. Te ayudaré a preparar un borrador; la confirmación se hace en el
        formulario.
      </p>
      <ErrorNotice error={chat.error} />
      {chat.isPending ? (
        <Loading />
      ) : (
        conversation && (
          <section className="card chat-panel">
            <ol className="chat-messages" aria-label="Conversación guardada">
              {!conversation.messages.length && (
                <li className="chat-message assistant">
                  <span className="eyebrow">LUMNI</span>
                  <p>Cuéntame para cuántas personas necesitas una sala y qué tienes en mente.</p>
                </li>
              )}
              {conversation.messages.map((message, index) => (
                <li className={`chat-message ${message.role}`} key={message.id}>
                  <span className="eyebrow">{message.role === 'user' ? 'TÚ' : 'LUMNI'}</span>
                  <p>{message.content}</p>
                  {message.card && (
                    <QuoteCard
                      card={message.card}
                      current={index === conversation.messages.length - 1}
                      busy={pending}
                      accept={() => {
                        void send('accept_alternative');
                      }}
                    />
                  )}
                </li>
              ))}
            </ol>
            <div ref={end} />
            {pending && <Loading label="Revisando tu solicitud…" />}
            <ErrorNotice error={error} />
            {error instanceof ApiError && error.status === 409 && (
              <p className="muted">
                Tu texto permanece aquí. Actualiza la conversación antes de volver a enviar; si
                cambió el borrador, continúa en su formulario.
              </p>
            )}
            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send('message');
              }}
            >
              <label htmlFor="chat-content">Tu mensaje</label>
              <textarea
                id="chat-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={1000}
                rows={3}
                required
                disabled={pending}
                placeholder="Necesito una sala para…"
              />
              <div className="row between">
                <small className="muted">{content.length}/1000 · Envía un mensaje por vez.</small>
                <button className="button" disabled={pending || !content.trim()}>
                  {pending ? 'Consultando…' : 'Enviar mensaje →'}
                </button>
              </div>
            </form>
            <Link className="inline-link" to="/salas">
              También puedes reservar desde el formulario →
            </Link>
          </section>
        )
      )}
    </>
  );
}
function QuoteCard({
  card,
  current,
  busy,
  accept,
}: {
  card: ChatCard;
  current: boolean;
  busy: boolean;
  accept: () => void;
}) {
  return (
    <section className="chat-quote" aria-label="Cotización del servidor">
      <span className="eyebrow">COTIZACIÓN DEL COTIZADOR</span>
      <h3>{card.roomName}</h3>
      <p>{slotLabel(card.quote.startsAt, card.quote.endsAt)}</p>
      <Breakdown quote={card.quote} />
      <Availability quote={card.quote} />
      {!current && <p className="muted">Esta cotización pertenece a un mensaje anterior.</p>}
      {current && card.quote.suggestedSlot && !card.quote.canBook && (
        <button className="button secondary" disabled={busy} onClick={accept}>
          Aceptar alternativa y volver a consultar →
        </button>
      )}
      {current && card.draftBookingId && (
        <Link
          className={`button lime ${busy ? 'disabled-link' : ''}`}
          to={`/reservas/${card.draftBookingId}`}
        >
          Revisar borrador →
        </Link>
      )}
    </section>
  );
}
