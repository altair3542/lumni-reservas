import { useEffect, useState, type RefObject } from 'react';
export function useDockFocus(ref: RefObject<HTMLElement | null>, open: boolean) {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const change = () => setMobile(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      (
        ref.current?.querySelector<HTMLElement>('textarea:not(:disabled)') ??
        ref.current?.querySelector<HTMLElement>('button')
      )?.focus(),
    );
    const surfaces = mobile
      ? [
          ...document.querySelectorAll<HTMLElement>(
            '.workspace > .sidebar, .workspace > .workspace-body',
          ),
        ]
      : [];
    const previous = surfaces.map((element) => element.inert);
    const overflow = document.body.style.overflow;
    surfaces.forEach((element) => {
      element.inert = true;
    });
    if (mobile) document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      surfaces.forEach((element, index) => {
        element.inert = previous[index] ?? false;
      });
      if (mobile) document.body.style.overflow = overflow;
    };
  }, [open, mobile, ref]);
  return mobile;
}
