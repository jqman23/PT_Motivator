'use client';

import { useEffect, useRef, useState } from 'react';

function findWidgetToolbar() {
  const settingsButton = document.querySelector('button[title="Widget settings"]');
  const libraryButton = document.querySelector('button[title="Exercise library"]');
  const anchor = settingsButton ?? libraryButton;
  return anchor?.parentElement instanceof HTMLElement ? anchor.parentElement : null;
}

export default function FloatingWidgetDockToggle() {
  const [open, setOpen] = useState(false);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let stopped = false;

    const attachToolbar = () => {
      if (stopped) return;
      const toolbar = findWidgetToolbar();
      if (!toolbar) return;
      toolbarRef.current = toolbar;
      toolbar.classList.add('pt-floating-widget-row');
      toolbar.classList.toggle('pt-floating-widget-row-open', open);
    };

    attachToolbar();
    const observer = new MutationObserver(attachToolbar);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      stopped = true;
      observer.disconnect();
      toolbarRef.current?.classList.remove('pt-floating-widget-row', 'pt-floating-widget-row-open');
    };
  }, [open]);

  useEffect(() => {
    document.body.classList.toggle('pt-widget-dock-open', open);
    return () => document.body.classList.remove('pt-widget-dock-open');
  }, [open]);

  useEffect(() => {
    const toolbar = toolbarRef.current ?? findWidgetToolbar();
    if (!toolbar) return;
    toolbarRef.current = toolbar;
    toolbar.classList.add('pt-floating-widget-row');
    toolbar.classList.toggle('pt-floating-widget-row-open', open);
  }, [open]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const closeAfterToolClick = (event: MouseEvent) => {
      if (!open) return;
      const target = event.target as Node | null;
      const toolbar = toolbarRef.current;
      if (!target || buttonRef.current?.contains(target)) return;
      if (toolbar?.contains(target)) window.setTimeout(() => setOpen(false), 90);
    };

    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('click', closeAfterToolClick, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('click', closeAfterToolClick, true);
    };
  }, [open]);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={open ? 'Collapse tools' : 'Open tools'}
      aria-expanded={open}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(current => !current);
      }}
      className="fixed z-[9998] flex h-14 w-14 items-center justify-center rounded-2xl border shadow-xl transition-all active:scale-95"
      style={{
        right: 'max(1rem, calc(env(safe-area-inset-right) + 1rem))',
        bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 1rem))',
        background: open ? '#7E9B86' : '#1F2F46',
        borderColor: open ? '#6f8c77' : '#1F2F46',
        color: '#fff',
        touchAction: 'manipulation',
      }}
      title={open ? 'Collapse tools' : 'Open tools'}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 transition-transform"
        style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
      >
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
      </svg>
    </button>
  );
}
