'use client';

import { useEffect } from 'react';

const MOVE_HANDLE_SELECTOR = '[title="Move exercise"]';

function markMoveHandles() {
  document.querySelectorAll<HTMLElement>(MOVE_HANDLE_SELECTOR).forEach(handle => {
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', 'Move exercise up or down');
    handle.dataset.exerciseMoveHandle = 'true';
  });
}

export default function ExerciseMoveHandleCompatibility() {
  useEffect(() => {
    markMoveHandles();
    const observer = new MutationObserver(markMoveHandles);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
