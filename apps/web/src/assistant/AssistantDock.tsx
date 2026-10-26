import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { uuidSchema, type ChatInput } from '@lumni/shared';
import { api } from '../lib/data.js';
import { fullDate } from '../lib/format.js';
import { ApiError } from '../api.js';
import { ErrorNotice, Loading } from '../components/Feedback.js';
import { AssistantIcon } from './AssistantIcon.js';
import { QuoteCard } from './QuoteCard.js';
import { useDockFocus } from './useDockFocus.js';

function remembered(ownerId: string): { id: string | null; open: boolean } {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`lumni-assistant:${ownerId}`) ?? 'null',
    );
    if (value && typeof value === 'object' && 'id' in value && 'open' in value)
      return {
        id: uuidSchema.safeParse(value.id).success ? (value.id as string) : null,
        open: value.open === true,
      };
  } catch {
    /* El almacenamiento no es necesario para recuperar el historial del servidor. */
  }
  return { id: null, open: false };
}
export function AssistantDock({ ownerId }: { ownerId: string }) {
  const [saved] = useState(() => remembered(ownerId));
  const [open, setOpen] = useState(saved.open);
  const [id, setId] = useState<string | null>(saved.id);
  const [initialized, setInitialized] = useState(Boolean(saved.id));
  const [history, setHistory] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lock = useRef(false);
  const retries = useRef(new Map<string, ChatInput>());
  const createId = useRef(crypto.randomUUID());
  const panel = useRef<HTMLElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mobile = useDockFocus(panel, open);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['conversations'],
    queryFn: api.conversations,
    enabled: open && (!initialized || history),
    staleTime: 0,
  });
  const chat = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.conversation(id!),
    enabled: Boolean(id) && open,
    staleTime: 0,
  });
  const conversation = chat.data?.conversation;
  const content = drafts[id ?? 'new'] ?? '';

  useEffect(() => {
    try {
      sessionStorage.setItem(`lumni-assistant:${ownerId}`, JSON.stringify({ id, open }));
    } catch {
      /* Sin historial ni texto del chat en el navegador. */
    }
  }, [id, open, ownerId]);
  useEffect(() => {
    if (open && !initialized && list.data) {
      setId(list.data.items[0]?.id ?? null);
      setInitialized(true);
    }
  }, [open, initialized, list.data]);
  useEffect(() => {
    const state: unknown = location.state;
    if (state && typeof state === 'object' && 'assistantOpen' in state && state.assistantOpen) {
      const requested = 'assistantConversationId' in state ? state.assistantConversationId : null;
      setId(uuidSchema.safeParse(requested).success ? (requested as string) : null);
      setInitialized(true);
      setHistory(false);
      setOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);
  useEffect(() => {
    if (open && !history && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [open, history, conversation?.messages.length, pending]);
  useEffect(() => {
    if (!Object.values(drafts).some((value) => value.trim())) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }
  function choose(next: string | null) {
    setId(next);
    setHistory(false);
    setInitialized(true);
    setError(null);
  }
  async function send(kind: ChatInput['kind']) {
    if (lock.current || (kind === 'message' && !content.trim()) || (id && !conversation)) return;
    lock.current = true;
    setPending(true);
    setError(null);
    let target = id;
    const text = content.trim();
    try {
      let current = conversation;
      if (!target) {
        const created = await api.createConversation(createId.current);
        current = created.conversation;
        target = current.id;
        queryClient.setQueryData(['conversation', target], created);
        setDrafts((values) => {
          const next = { ...values, [target!]: text };
          delete next.new;
          return next;
        });
        setId(target);
        setInitialized(true);
        createId.current = crypto.randomUUID();
      }
      if (!current) return;
      const previous = retries.current.get(target);
      const same =
        previous?.kind === kind &&
        (previous.kind === 'accept_alternative' || previous.content === text);
      const input: ChatInput = same
        ? previous
        : kind === 'message'
          ? {
              kind,
              content: text,
              expectedVersion: current.version,
              clientMessageId: crypto.randomUUID(),
            }
          : { kind, expectedVersion: current.version, clientMessageId: crypto.randomUUID() };
      retries.current.set(target, input);
      const result = await api.chat(target, input);
      await queryClient.cancelQueries({ queryKey: ['conversation', target] });
      queryClient.setQueryData(['conversation', target], result);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (kind === 'message') setDrafts((values) => ({ ...values, [target!]: '' }));
      retries.current.delete(target);
    } catch (error) {
      setError(error);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const waiting = (!initialized && list.isPending) || (Boolean(id) && chat.isPending);
  return (
    <>
      <button
        ref={launcher}
        className={`assistant-launcher ${open ? 'is-open' : ''}`}
        type="button"
        aria-label={open ? 'Cerrar asistente' : 'Hablar con Lumni'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="lumni-assistant"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="assistant-launcher-hint">¿Te ayudo con tu reserva?</span>
        <AssistantIcon name={open ? 'close' : 'chat'} />
        {!open && <i aria-hidden="true" />}
      </button>
      <section
        ref={panel}
        id="lumni-assistant"
        className="assistant-drawer"
        role="dialog"
        aria-label="Asistente de reservas"
        aria-modal={mobile ? true : undefined}
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
          if (event.key !== 'Tab' || !mobile) return;
          const fields = [
            ...(panel.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), textarea:not(:disabled), a[href]',
            ) ?? []),
          ].filter((field) => field.getClientRects().length);
          const first = fields[0],
            last = fields.at(-1);
          if (!first) {
            event.preventDefault();
            return;
          }
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="assistant-header">
          <span className="assistant-avatar" aria-hidden="true">
            l
          </span>
          <div>
            <h2>Lumni</h2>
            <p>Tu asistente de espacios</p>
          </div>
          <button
            className="assistant-icon-button"
            title="Minimizar"
            aria-label="Minimizar asistente"
            onClick={close}
          >
            <AssistantIcon name="close" />
          </button>
        </header>
        <div className="assistant-toolbar">
          <button
            disabled={pending}
            onClick={() => {
              setHistory(!history);
              setError(null);
            }}
          >
            <AssistantIcon name={history ? 'back' : 'history'} />
            {history ? 'Volver al chat' : 'Conversaciones'}
          </button>
          <button
            disabled={pending}
            onClick={() => {
              choose(null);
              createId.current = crypto.randomUUID();
            }}
          >
            <AssistantIcon name="plus" />
            Nueva
          </button>
        </div>
        <div ref={viewport} className="assistant-viewport">
          {history ? (
            <div className="assistant-history">
              <h3>Tus conversaciones</h3>
              <p>Retoma donde lo dejaste.</p>
              <ErrorNotice error={list.error} />
              {list.isPending ? (
                <Loading />
              ) : list.data?.items.length ? (
                <ul>
                  {list.data.items.map((item) => (
                    <li key={item.id}>
                      <button onClick={() => choose(item.id)}>
                        <AssistantIcon name="chat" />
                        <span>
                          Encuentro del {fullDate(item.updatedAt)}
                          <small>
                            {item.draftBookingId
                              ? 'Con borrador guardado'
                              : 'Conversación guardada'}
                          </small>
                        </span>
                        <span aria-hidden="true">↗</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Aquí encontrarás tus conversaciones guardadas.</p>
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
            </div>
          ) : (
            <>
              {waiting ? (
                <Loading label="Recuperando tu conversación…" />
              ) : (
                !conversation?.messages.length && (
                  <div className="assistant-welcome">
                    <div className="assistant-welcome-art" aria-hidden="true">
                      <span>l</span>
                      <i />
                      <i />
                    </div>
                    <span className="eyebrow">HAGAMOS ESPACIO</span>
                    <h3>
                      ¿Qué tienes
                      <br />
                      en mente?
                    </h3>
                    <p>
                      Cuéntame cómo será tu reunión.
                      <br />
                      Encontramos juntos la sala y el horario.
                    </p>
                    <div className="assistant-suggestions">
                      {['Una sala para mi equipo', 'Una reunión con proyector'].map((text) => (
                        <button
                          key={text}
                          disabled={pending}
                          onClick={() => {
                            setDrafts((values) => ({ ...values, [id ?? 'new']: text }));
                            textarea.current?.focus();
                          }}
                        >
                          {text}
                          <span aria-hidden="true">↗</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
              <ErrorNotice error={id ? chat.error : list.error} />
              {conversation && (
                <ol className="assistant-messages" aria-label="Conversación guardada">
                  {conversation.messages.map((message, index) => (
                    <li className={`assistant-message ${message.role}`} key={message.id}>
                      <span className="sr-only">{message.role === 'user' ? 'Tú' : 'Lumni'}:</span>
                      <p>{message.content}</p>
                      {message.card && (
                        <QuoteCard
                          card={message.card}
                          current={index === conversation.messages.length - 1}
                          busy={pending}
                          onOpenDraft={close}
                          accept={() => {
                            void send('accept_alternative');
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {pending && (
                <div className="assistant-typing" role="status">
                  <span aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Revisando tu solicitud…
                </div>
              )}
              <ErrorNotice error={error} />
              {error instanceof ApiError && error.status === 409 && (
                <p className="assistant-error-help">
                  Tu texto sigue aquí. Actualiza la conversación; si editaste el borrador, continúa
                  en el formulario.
                </p>
              )}
              {id && (
                <button
                  className="assistant-refresh"
                  disabled={pending || chat.isFetching}
                  onClick={() => {
                    retries.current.delete(id);
                    setError(null);
                    void chat.refetch();
                  }}
                >
                  <AssistantIcon name="refresh" />
                  Actualizar conversación
                </button>
              )}
            </>
          )}
        </div>
        {!history && (
          <form
            className="assistant-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send('message');
            }}
          >
            <div className="assistant-input">
              <label className="sr-only" htmlFor="assistant-content">
                Tu mensaje
              </label>
              <textarea
                ref={textarea}
                id="assistant-content"
                value={content}
                onChange={(event) =>
                  setDrafts((values) => ({ ...values, [id ?? 'new']: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={1000}
                rows={2}
                required
                disabled={pending || waiting}
                placeholder="Cuéntame qué necesitas…"
              />
              <button
                aria-label="Enviar mensaje"
                title="Enviar mensaje"
                className="assistant-send"
                disabled={pending || waiting || !content.trim()}
              >
                <AssistantIcon name="send" />
              </button>
            </div>
            <p>Horarios de Colombia · Confirmas en el formulario</p>
          </form>
        )}
      </section>
    </>
  );
}
