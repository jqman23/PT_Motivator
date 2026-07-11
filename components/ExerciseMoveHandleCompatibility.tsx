'use client';

import { useEffect } from 'react';

const MOVE_HANDLE_SELECTOR = '[title="Move exercise"]';

function markMoveHandles() {
  document.querySelectorAll<HTMLElement>(MOVE_HANDLE_SELECTOR).forEach(handle => {
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', 'Move exercise up or down');
    handle.dataset.exerciseMoveHandle = 'true';

    const card = handle.closest<HTMLElement>('[data-exercise-card-id]');
    if (!card) return;

    const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button'));
    const upButton = buttons.find(button => button.textContent?.includes('↑ Up'));
    const downButton = buttons.find(button => button.textContent?.includes('↓ Down'));
    const controls = upButton?.parentElement;

    if (controls && downButton?.parentElement === controls) {
      controls.dataset.exerciseMoveControls = 'true';
      card.dataset.moveControlsOpen = 'true';
      upButton.setAttribute('aria-label', 'Move exercise up');
      downButton.setAttribute('aria-label', 'Move exercise down');
    } else if (!card.querySelector('[data-exercise-move-controls="true"]')) {
      delete card.dataset.moveControlsOpen;
    }
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
