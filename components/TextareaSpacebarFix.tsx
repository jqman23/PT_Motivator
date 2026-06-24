'use client';

import { useEffect } from 'react';

function isAiDraftTipsTextarea(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement && target.placeholder === 'Tips, one per line';
}

export default function TextareaSpacebarFix() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !isAiDraftTipsTextarea(event.target)) return;

      const textarea = event.target;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? start;
      event.preventDefault();

      textarea.value = `${textarea.value.slice(0, start)} ${textarea.value.slice(end)}`;
      textarea.setSelectionRange(start + 1, start + 1);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return null;
}
