'use client';

import { useEffect } from 'react';

const TYPE_LIST_ID = 'exercise-entry-kind-options';
const QUICK_LOG_ATTR = 'data-pt-quick-log';

function shorthandFor(value: string): 'REP' | 'DUR' | null {
  const clean = value.trim().toLowerCase();
  if (clean.startsWith('d')) return 'DUR';
  if (clean.startsWith('r')) return 'REP';
  return null;
}

export default function DurationTypeAutofillEnhancer() {
  useEffect(() => {
    let rewriting = false;
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    const isTypeInput = (target: EventTarget | null): target is HTMLInputElement =>
      target instanceof HTMLInputElement && target.getAttribute('list') === TYPE_LIST_ID;

    const markQuickLog = (input: HTMLInputElement) => {
      input.closest('div.fixed')?.setAttribute(QUICK_LOG_ATTR, 'true');
      const list = document.getElementById(TYPE_LIST_ID);
      if (list instanceof HTMLDataListElement) {
        const options = list.querySelectorAll('option');
        if (options[0]) options[0].value = 'REP';
        if (options[1]) options[1].value = 'DUR';
      }
    };

    const normalize = (input: HTMLInputElement) => {
      markQuickLog(input);
      const next = shorthandFor(input.value);
      if (!next || input.value === next || rewriting) return;

      rewriting = true;
      if (nativeSetter) nativeSetter.call(input, next);
      else input.value = next;
      input.setSelectionRange(next.length, next.length);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      rewriting = false;
    };

    const scan = () => {
      document
        .querySelectorAll<HTMLInputElement>(`input[list="${TYPE_LIST_ID}"]`)
        .forEach(normalize);
    };

    const handleInput = (event: Event) => {
      if (!isTypeInput(event.target)) return;
      normalize(event.target);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!isTypeInput(event.target)) return;
      const input = event.target;
      window.setTimeout(() => normalize(input), 0);
    };

    document.addEventListener('input', handleInput, true);
    document.addEventListener('focusout', handleFocusOut, true);

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();

    return () => {
      observer.disconnect();
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('focusout', handleFocusOut, true);
    };
  }, []);

  return null;
}
