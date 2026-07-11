'use client';

import { useEffect } from 'react';

function isWeekGoalInput(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement) || target.type !== 'number') return false;
  const row = target.parentElement;
  if (!row) return false;
  return Array.from(row.querySelectorAll('span')).some(
    span => span.textContent?.trim().toLowerCase() === 'daily goal'
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
}

export default function WeekGoalInputEnhancer() {
  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (!isWeekGoalInput(event.target)) return;
      const input = event.target;
      input.dataset.weekGoalEditing = 'true';
      input.dataset.weekGoalInitial = input.value;
      input.dataset.weekGoalDraft = input.value;
    };

    const handleInput = (event: Event) => {
      if (!isWeekGoalInput(event.target)) return;
      const input = event.target;
      if (input.dataset.weekGoalEditing !== 'true') return;

      input.dataset.weekGoalDraft = input.value;
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const commitInput = (input: HTMLInputElement) => {
      const initial = input.dataset.weekGoalInitial || '1';
      const draft = input.dataset.weekGoalDraft ?? input.value;
      const parsed = Number.parseInt(draft, 10);
      const next = draft.trim() === '' || !Number.isFinite(parsed)
        ? initial
        : String(Math.max(1, Math.min(99, parsed)));

      delete input.dataset.weekGoalEditing;
      delete input.dataset.weekGoalInitial;
      delete input.dataset.weekGoalDraft;

      setNativeInputValue(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!isWeekGoalInput(event.target)) return;
      const input = event.target;
      if (input.dataset.weekGoalEditing === 'true') commitInput(input);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isWeekGoalInput(event.target)) return;
      const input = event.target;
      if (input.dataset.weekGoalEditing !== 'true') return;

      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        const initial = input.dataset.weekGoalInitial || input.value;
        input.dataset.weekGoalDraft = initial;
        setNativeInputValue(input, initial);
        input.blur();
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  return null;
}
