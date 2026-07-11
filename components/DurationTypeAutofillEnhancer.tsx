'use client';

import { useEffect } from 'react';

const TYPE_LIST_ID = 'exercise-entry-kind-options';

export default function DurationTypeAutofillEnhancer() {
  useEffect(() => {
    let rewriting = false;
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    const handleInput = (event: Event) => {
      if (rewriting) return;
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.getAttribute('list') !== TYPE_LIST_ID) return;
      if (!input.value.trim().toLowerCase().startsWith('d')) return;
      if (input.value === 'DUR') return;

      rewriting = true;
      if (nativeSetter) nativeSetter.call(input, 'DUR');
      else input.value = 'DUR';
      input.setSelectionRange(3, 3);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      rewriting = false;
    };

    document.addEventListener('input', handleInput, true);
    return () => document.removeEventListener('input', handleInput, true);
  }, []);

  return null;
}
