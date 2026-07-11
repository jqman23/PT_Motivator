'use client';

import { useEffect } from 'react';

const CAMERA_BUTTON_SELECTOR = 'button[title="Attach photo"]';

function hideDuplicateExerciseNoteCamera() {
  document.querySelectorAll<HTMLButtonElement>(CAMERA_BUTTON_SELECTOR).forEach(button => {
    const modal = button.closest<HTMLElement>('div.fixed.inset-0');
    if (!modal) return;

    const isExerciseNoteModal = modal.textContent?.includes('Photo attachment')
      && modal.textContent?.includes('Note for');

    if (isExerciseNoteModal) {
      button.style.display = 'none';
      button.setAttribute('aria-hidden', 'true');
      button.tabIndex = -1;
    }
  });
}

export default function ExerciseNotePhotoButtonCleanup() {
  useEffect(() => {
    let frame = 0;

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        hideDuplicateExerciseNoteCamera();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
