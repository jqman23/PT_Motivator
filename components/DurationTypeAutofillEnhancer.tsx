'use client';

import { useEffect } from 'react';

const TYPE_LIST_ID = 'exercise-entry-kind-options';
const QUICK_LOG_ATTR = 'data-pt-quick-log';
const TYPE_INPUT_ATTR = 'data-pt-type-input';
const METRIC_SUFFIX = /\s*\(\d+\s*[×x]\s*\d+\s+(?:reps?|secs?)\)\s*$/i;

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
      target instanceof HTMLInputElement && (
        target.dataset.ptTypeInput === 'true' || target.getAttribute('list') === TYPE_LIST_ID
      );

    const cleanPopupTitle = (root: HTMLElement | null) => {
      const header = root?.firstElementChild;
      const title = header?.querySelector('p');
      if (!(title instanceof HTMLParagraphElement)) return;
      title.textContent = (title.textContent || '').replace(METRIC_SUFFIX, '').trim();
    };

    const markQuickLog = (input: HTMLInputElement) => {
      input.dataset.ptTypeInput = 'true';
      input.removeAttribute('list');

      const root = input.closest<HTMLElement>('div.fixed');
      root?.setAttribute(QUICK_LOG_ATTR, 'true');
      cleanPopupTitle(root);

      const list = document.getElementById(TYPE_LIST_ID);
      if (list instanceof HTMLDataListElement) {
        list.hidden = true;
        list.style.display = 'none';
      }
    };

    const defaultDurationToSeconds = (input: HTMLInputElement) => {
      window.requestAnimationFrame(() => {
        const root = input.closest<HTMLElement>('div.fixed');
        const unitButton = root?.querySelector<HTMLButtonElement>('button[title="Toggle seconds or minutes"]');
        if (unitButton?.textContent?.trim().toLowerCase() === 'min') unitButton.click();
      });
    };

    const normalize = (input: HTMLInputElement, fromUser = false) => {
      markQuickLog(input);
      const next = shorthandFor(input.value);
      if (!next || input.value === next || rewriting) return;

      rewriting = true;
      if (nativeSetter) nativeSetter.call(input, next);
      else input.value = next;
      input.setSelectionRange(next.length, next.length);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      rewriting = false;

      if (fromUser && next === 'DUR') defaultDurationToSeconds(input);
    };

    const scan = () => {
      document
        .querySelectorAll<HTMLInputElement>(`input[list="${TYPE_LIST_ID}"], input[${TYPE_INPUT_ATTR}="true"]`)
        .forEach(input => normalize(input));
    };

    const handleInput = (event: Event) => {
      if (!isTypeInput(event.target)) return;
      normalize(event.target, true);
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
