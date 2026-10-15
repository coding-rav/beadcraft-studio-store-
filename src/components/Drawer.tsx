import { ReactNode, useEffect, useRef } from 'react';

type Props = { open: boolean; onClose(): void; title: string; side?: 'left' | 'right'; children: ReactNode };

/** Accessible slide-over: dialog semantics, Esc to close, focus trap, scroll lock, focus restore. */
export default function Drawer({ open, onClose, title, side = 'right', children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);

  const pos = side === 'right'
    ? `right-0 ${open ? 'translate-x-0' : 'translate-x-full'}`
    : `left-0 ${open ? 'translate-x-0' : '-translate-x-full'}`;
  return (
    <>
      <div onClick={onClose} aria-hidden="true" className={`fixed inset-0 z-30 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open}
        className={`fixed inset-y-0 z-40 flex h-[100dvh] w-full max-w-sm flex-col bg-[#FFFAF6] px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-200 ${pos} ${open ? 'visible' : 'invisible'}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-[#7A1F2B]">{title}</h2>
          <button ref={closeBtn} onClick={onClose} aria-label={`Close ${title}`} className="h-11 w-11 rounded-full border border-[#ecd9dc]">✕</button>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
      </aside>
    </>
  );
}
