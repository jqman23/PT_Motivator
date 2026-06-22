'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function findWidgetToolbar() {
  const settingsButton = document.querySelector('button[title="Widget settings"]');
  const libraryButton = document.querySelector('button[title="Exercise library"]');
  const anchor = settingsButton ?? libraryButton;
  return anchor?.parentElement instanceof HTMLElement ? anchor.parentElement : null;
}

const BUTTON_SIZE = 56; // h-14 w-14
const DRAG_THRESHOLD = 6;

function clampRight(rightPx: number): number {
  return Math.max(8, Math.min(rightPx, window.innerWidth - BUTTON_SIZE - 8));
}

export default function FloatingWidgetDockToggle() {
  const [open, setOpen] = useState(false);
  const [rightPx, setRightPx] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rightPxRef = useRef<number | null>(null);
  const dragState = useRef<{ startClientX: number; startRight: number; moved: boolean } | null>(null);
  const lastWasDrag = useRef(false);

  const updateRight = useCallback((value: number | null) => {
    rightPxRef.current = value;
    setRightPx(value);
    if (value !== null) {
      document.documentElement.style.setProperty('--pt-dock-right', `${value}px`);
    } else {
      document.documentElement.style.removeProperty('--pt-dock-right');
    }
  }, []);

  // Load persisted position
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pt-dock-right-px');
      if (saved !== null) {
        const v = Number(saved);
        if (isFinite(v)) updateRight(clampRight(v));
      }
    } catch {}
  }, [updateRight]);

  // Re-clamp on resize
  useEffect(() => {
    const onResize = () => {
      if (rightPxRef.current !== null) {
        const clamped = clampRight(rightPxRef.current);
        if (clamped !== rightPxRef.current) updateRight(clamped);
      }
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [updateRight]);

  // Body class for dock open state
  useEffect(() => {
    document.body.classList.toggle('pt-widget-dock-open', open);
    return () => document.body.classList.remove('pt-widget-dock-open');
  }, [open]);

  // Keyboard + click-outside-dock close
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeAfterToolClick = (event: MouseEvent) => {
      if (!open) return;
      const target = event.target as Node | null;
      if (!target || buttonRef.current?.contains(target)) return;
      const toolbar = findWidgetToolbar();
      if (toolbar?.contains(target)) window.setTimeout(() => setOpen(false), 90);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('click', closeAfterToolClick, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('click', closeAfterToolClick, true);
    };
  }, [open]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const startRight = rightPxRef.current !== null
      ? rightPxRef.current
      : buttonRef.current
        ? window.innerWidth - buttonRef.current.getBoundingClientRect().right
        : 16;
    dragState.current = { startClientX: e.clientX, startRight, moved: false };
    lastWasDrag.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startClientX;
    if (!dragState.current.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    dragState.current.moved = true;
    updateRight(clampRight(dragState.current.startRight - dx));
  }, [updateRight]);

  const handlePointerUp = useCallback(() => {
    if (!dragState.current) return;
    const wasDrag = dragState.current.moved;
    dragState.current = null;
    lastWasDrag.current = wasDrag;
    if (wasDrag && rightPxRef.current !== null) {
      try { localStorage.setItem('pt-dock-right-px', String(rightPxRef.current)); } catch {}
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (lastWasDrag.current) {
      lastWasDrag.current = false;
      return;
    }
    setOpen(current => !current);
  }, []);

  const effectiveRight = rightPx !== null
    ? `${rightPx}px`
    : 'max(1rem, calc(env(safe-area-inset-right) + 1rem))';

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={open ? 'Collapse tools' : 'Open tools'}
      aria-expanded={open}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      className="fixed z-[9998] flex h-14 w-14 items-center justify-center rounded-2xl border shadow-xl active:scale-95"
      style={{
        right: effectiveRight,
        bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 1rem))',
        background: open ? '#7E9B86' : '#1F2F46',
        borderColor: open ? '#6f8c77' : '#1F2F46',
        color: '#fff',
        touchAction: 'none',
        userSelect: 'none',
        transition: 'background-color 150ms ease, border-color 150ms ease, transform 150ms ease',
        cursor: 'grab',
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
        className="h-6 w-6"
        style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }}
      >
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
      </svg>
    </button>
  );
}
