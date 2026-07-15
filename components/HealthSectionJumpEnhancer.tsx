'use client';

import { useEffect } from 'react';
import { sectionJumpMode } from '@/lib/sectionJump';

const BUTTON_SELECTOR = '[data-health-section-jump="true"]';

const HEALTH_ICON = `
  <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
    <rect x="5" y="13" width="3.2" height="6" rx="1.6" />
    <rect x="10.4" y="9" width="3.2" height="10" rx="1.6" />
    <rect x="15.8" y="5" width="3.2" height="14" rx="1.6" />
  </svg>
`;

const TOP_ICON = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </svg>
`;

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
  button.dataset.jumpMode = 'health';
  button.setAttribute('aria-label', 'Jump to how are you feeling');
  button.title = 'How are you feeling?';
  button.innerHTML = HEALTH_ICON;
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
    if (button.dataset.jumpMode === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const section = findHealthSection();
    if (!section) return;
    section.style.scrollMarginTop = '5.75rem';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return button;
}

function setJumpMode(button: HTMLButtonElement, mode: 'health' | 'top') {
  if (button.dataset.jumpMode === mode) return;
  button.dataset.jumpMode = mode;
  const isTop = mode === 'top';
  button.setAttribute('aria-label', isTop ? 'Back to top' : 'Jump to how are you feeling');
  button.title = isTop ? 'Back to top' : 'How are you feeling?';
  button.innerHTML = isTop ? TOP_ICON : HEALTH_ICON;
}

export default function HealthSectionJumpEnhancer() {
  useEffect(() => {
    let scanFrame = 0;
    let scrollFrame = 0;

    const updateJumpButton = () => {
      scrollFrame = 0;
      const jumpButton = document.querySelector<HTMLButtonElement>(BUTTON_SELECTOR);
      if (!jumpButton) return;

      const isMobile = window.matchMedia('(max-width: 639px)').matches;
      const mode = sectionJumpMode(isMobile, window.scrollY, window.innerHeight);
      setJumpMode(jumpButton, mode);
    };

    const scheduleJumpButtonUpdate = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateJumpButton);
    };

    const scan = () => {
      scanFrame = 0;
      if (document.querySelector(BUTTON_SELECTOR)) {
        scheduleJumpButtonUpdate();
        return;
      }

      const sunshineButton = document.querySelector<HTMLButtonElement>('button[aria-label="Show daily summary"]');
      const whitePill = sunshineButton?.parentElement;
      const stickyToolbar = whitePill?.parentElement;
      if (!sunshineButton || !whitePill || !stickyToolbar) return;

      stickyToolbar.style.alignItems = 'center';
      if (!document.querySelector(BUTTON_SELECTOR)) stickyToolbar.appendChild(createJumpButton());
      document.querySelector('[data-top-section-jump="true"]')?.remove();
      scheduleJumpButtonUpdate();
    };

    const scheduleScan = () => {
      if (!scanFrame) scanFrame = window.requestAnimationFrame(scan);
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', scheduleJumpButtonUpdate, { passive: true });
    window.addEventListener('resize', scheduleJumpButtonUpdate);
    scheduleScan();

    return () => {
      observer.disconnect();
      if (scanFrame) window.cancelAnimationFrame(scanFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener('scroll', scheduleJumpButtonUpdate);
      window.removeEventListener('resize', scheduleJumpButtonUpdate);
      document.querySelector(BUTTON_SELECTOR)?.remove();
      document.querySelector('[data-top-section-jump="true"]')?.remove();
    };
  }, []);

  return null;
}
