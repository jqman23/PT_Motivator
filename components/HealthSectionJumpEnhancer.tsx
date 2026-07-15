'use client';

import { useEffect } from 'react';

const BUTTON_SELECTOR = '[data-health-section-jump="true"]';
const TOP_BUTTON_SELECTOR = '[data-top-section-jump="true"]';

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

function createTopButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.topSectionJump = 'true';
  button.setAttribute('aria-label', 'Back to top');
  button.title = 'Back to top';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  `;
  Object.assign(button.style, {
    width: '36px',
    height: '36px',
    minWidth: '36px',
    flex: '0 0 36px',
    alignSelf: 'center',
    marginLeft: '6px',
    display: 'none',
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  return button;
}

export default function HealthSectionJumpEnhancer() {
  useEffect(() => {
    let scanFrame = 0;
    let scrollFrame = 0;

    const updateTopButton = () => {
      scrollFrame = 0;
      const topButton = document.querySelector<HTMLButtonElement>(TOP_BUTTON_SELECTOR);
      if (!topButton) return;

      const section = findHealthSection();
      const isMobile = window.matchMedia('(max-width: 639px)').matches;
      const show = Boolean(isMobile && section && section.getBoundingClientRect().top <= 96);
      topButton.style.display = show ? 'flex' : 'none';
    };

    const scheduleTopButtonUpdate = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateTopButton);
    };

    const scan = () => {
      scanFrame = 0;
      if (document.querySelector(BUTTON_SELECTOR) && document.querySelector(TOP_BUTTON_SELECTOR)) {
        scheduleTopButtonUpdate();
        return;
      }

      const sunshineButton = document.querySelector<HTMLButtonElement>('button[aria-label="Show daily summary"]');
      const whitePill = sunshineButton?.parentElement;
      const stickyToolbar = whitePill?.parentElement;
      if (!sunshineButton || !whitePill || !stickyToolbar) return;

      stickyToolbar.style.alignItems = 'center';
      if (!document.querySelector(BUTTON_SELECTOR)) stickyToolbar.appendChild(createJumpButton());
      if (!document.querySelector(TOP_BUTTON_SELECTOR)) stickyToolbar.appendChild(createTopButton());
      scheduleTopButtonUpdate();
    };

    const scheduleScan = () => {
      if (!scanFrame) scanFrame = window.requestAnimationFrame(scan);
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', scheduleTopButtonUpdate, { passive: true });
    window.addEventListener('resize', scheduleTopButtonUpdate);
    scheduleScan();

    return () => {
      observer.disconnect();
      if (scanFrame) window.cancelAnimationFrame(scanFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener('scroll', scheduleTopButtonUpdate);
      window.removeEventListener('resize', scheduleTopButtonUpdate);
      document.querySelector(BUTTON_SELECTOR)?.remove();
      document.querySelector(TOP_BUTTON_SELECTOR)?.remove();
    };
  }, []);

  return null;
}
