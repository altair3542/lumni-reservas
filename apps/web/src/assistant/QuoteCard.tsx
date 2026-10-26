import { Link } from 'react-router-dom';
import type { ChatCard } from '@lumni/shared';
import { slotLabel } from '../lib/format.js';
import { Availability, Breakdown } from '../components/Feedback.js';
export function QuoteCard({
  card,
  current,
  busy,
  accept,
  onOpenDraft,
}: {
  card: ChatCard;
  current: boolean;
  busy: boolean;
  accept: () => void;
  onOpenDraft: () => void;
}) {
  return (
    <section className="chat-quote" aria-label="Cotización de tu reserva">
      <span className="eyebrow">TU COTIZACIÓN</span>
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
          onClick={(event) => {
            if (busy) event.preventDefault();
            else onOpenDraft();
          }}
        >
          Revisar borrador →
        </Link>
      )}
    </section>
  );
}
