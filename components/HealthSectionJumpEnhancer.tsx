'use client';

import { useEffect } from 'react';

const BUTTON_SELECTOR = '[data-health-section-jump="true"]';

function findHealthSection(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll('h2')).find(
    node => node.textContent?.trim() === 'How are you feeling?'
  );
  if (!heading) return null;
  return (heading.closest('div.rounded-2xl') as HTMLElement | null) ?? (heading as HTMLElement);
}

function createJumpButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.healthSectionJump = 'true';
  button.setAttribute('aria-label', 'Jump to how are you feeling');
  button.title = 'How are you feeling?';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.2-7-10a4.1 4.1 0 0 1 7-2.7A4.1 4.1 0 0 1 19 10c0 5.8-7 10-7 10z"/>
      <path d="M7.5 12h2l1.1-2.5 2.1 5 1.1-2.5h2.7"/>
    </svg>
  `;
  Object.assign(button.style, {
    width: '36px',
    height: '36px',
    minWidth: '36px',
    flex: '0 0 36px',
    marginLeft: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    borderRadius: '9999px',
    border: '1px solid #CAD9CF',
    background: '#FFFFFF',
    color: '#476653',
    boxShadow: '0 1px 3px rgba(28, 25, 23, 0.08)',
    touchAction: 'manipulation',
    cursor: 'pointer',
  });

  button.addEventListener('click', () => {
    const section = findHealthSection();
    if (!section) return;
    section.style.scrollMarginTop = '5.75rem';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return button;
}

export default function HealthSectionJumpEnhancer() {
  useEffect(() => {
    let scanFrame = 0;

    const scan = () => {
      scanFrame = 0;
      if (document.querySelector(BUTTON_SELECTOR)) return;

      const sunshineButton = document.querySelector<HTMLButtonElement>('button[aria-label="Show daily summary"]');
      const whitePill = sunshineButton?.parentElement;
      const stickyToolbar = whitePill?.parentElement;
      if (!sunshineButton || !whitePill || !stickyToolbar) return;

      stickyToolbar.appendChild(createJumpButton());
    };

    const scheduleScan = () => {
      if (!scanFrame) scanFrame = window.requestAnimationFrame(scan);
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleScan();

    return () => {
      observer.disconnect();
      if (scanFrame) window.cancelAnimationFrame(scanFrame);
      document.querySelector(BUTTON_SELECTOR)?.remove();
    };
  }, []);

  return null;
}
