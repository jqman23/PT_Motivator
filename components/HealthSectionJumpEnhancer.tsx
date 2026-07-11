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
    <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
      <rect x="5" y="13" width="3.2" height="6" rx="1.6" />
      <rect x="10.4" y="9" width="3.2" height="10" rx="1.6" />
      <rect x="15.8" y="5" width="3.2" height="14" rx="1.6" />
    </svg>
  `;
  Object.assign(button.style, {
    width: '36px',
    height: '36px',
    minWidth: '36px',
    flex: '0 0 36px',
    alignSelf: 'center',
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

      stickyToolbar.style.alignItems = 'center';
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
