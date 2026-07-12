'use client';

import { useEffect } from 'react';

const NATIVE_WINDOW_MS = 285;
const EXTENDED_WINDOW_MS = 420;
const SYNTHETIC_FLAG = 'exerciseStableDoubleTap';

function isProtectedTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest('button, input, textarea, select, a, [role="button"]'),
  );
}

export default function ExerciseDoubleTapStabilityGuard() {
  useEffect(() => {
    const lastTap = new WeakMap<HTMLElement, number>();

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || isProtectedTarget(target)) return;

      const card = target.closest<HTMLElement>('[data-exercise-card-id]');
      if (!card || card.dataset[SYNTHETIC_FLAG] === 'true') return;

      const now = Date.now();
      const previous = lastTap.get(card) || 0;
      const delta = now - previous;
      lastTap.set(card, now);

      // The existing handler already covers fast double taps. Only bridge the
      // slightly slower mobile range that it previously missed.
      if (delta <= NATIVE_WINDOW_MS || delta > EXTENDED_WINDOW_MS) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      lastTap.set(card, 0);

      card.dataset[SYNTHETIC_FLAG] = 'true';
      try {
        card.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
        }));
        card.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
        }));
      } finally {
        delete card.dataset[SYNTHETIC_FLAG];
      }
    };

    const blockDuplicateDoubleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-exercise-card-id]') || isProtectedTarget(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('dblclick', blockDuplicateDoubleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('dblclick', blockDuplicateDoubleClick, true);
    };
  }, []);

  return null;
}
