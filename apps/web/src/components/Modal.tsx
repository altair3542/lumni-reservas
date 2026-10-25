import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
let openModals = 0;
export function Modal({
  children,
  titleId,
  label,
  onDismiss,
  className = '',
}: {
  children: ReactNode;
  titleId?: string;
  label?: string;
  onDismiss?: (() => void) | undefined;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const workspace = document.querySelector('.workspace');
    openModals += 1;
    workspace?.setAttribute('inert', '');
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea, a[href]')?.focus();
    return () => {
      openModals -= 1;
      if (openModals === 0) workspace?.removeAttribute('inert');
      if (previous instanceof HTMLElement && previous.isConnected && !previous.closest('[inert]'))
        previous.focus();
    };
  }, []);
  return createPortal(
    <div className="modal-backdrop">
      <section
        ref={ref}
        className={`card modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && onDismiss) {
            event.preventDefault();
            onDismiss();
          }
          if (event.key !== 'Tab') return;
          const fields = [
            ...(ref.current?.querySelectorAll<HTMLElement>(
              'input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
            ) ?? []),
          ].filter((field) => field.getClientRects().length > 0);
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
        {children}
      </section>
    </div>,
    document.body,
  );
}
