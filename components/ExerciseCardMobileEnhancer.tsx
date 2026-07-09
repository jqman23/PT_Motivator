'use client';

import { useEffect } from 'react';

function makeMenuButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.mobileActionMenu = 'true';
  button.title = 'Exercise actions';
  button.setAttribute('aria-label', 'Exercise actions');
  button.className = 'w-8 h-8 rounded-lg bg-stone-100 text-stone-400 flex items-center justify-center transition-colors flex-shrink-0';
  button.style.touchAction = 'manipulation';
  button.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>';
  return button;
}

function setButtons(buttons: HTMLButtonElement[], expanded: boolean) {
  buttons.forEach(button => {
    if (button.dataset.mobileActionMenu === 'true') return;
    button.style.display = expanded ? '' : 'none';
  });
}

function setPreview(actionBox: HTMLElement, expanded: boolean) {
  const preview = actionBox.querySelector<HTMLElement>('[data-mobile-action-preview="true"]');
  if (!preview) return;
  preview.style.display = expanded ? '' : 'none';
}

function setTypeBadge(card: HTMLElement, actionBox: HTMLElement, expanded: boolean, isMobile: boolean) {
  const primaryType = card.querySelector<HTMLElement>('[data-mobile-primary-type="true"]');
  const expandedType = actionBox.querySelector<HTMLElement>('[data-mobile-expanded-type="true"]');
  if (primaryType) primaryType.style.display = isMobile && expanded ? 'none' : '';
  if (expandedType) {
    expandedType.style.display = isMobile && expanded ? 'inline-flex' : 'none';
    expandedType.style.flexBasis = '100%';
    expandedType.style.justifyContent = 'flex-end';
    expandedType.style.order = '99';
  }
}

function enhanceCard(card: HTMLElement) {
  const actionBox = card.lastElementChild;
  if (!(actionBox instanceof HTMLElement)) return;

  const buttons = Array.from(actionBox.querySelectorAll('button')) as HTMLButtonElement[];
  const actionButtons = buttons.filter(button => button.dataset.mobileActionMenu !== 'true');
  if (actionButtons.length < 4) return;

  let menu = actionBox.querySelector<HTMLButtonElement>('button[data-mobile-action-menu="true"]');
  if (!menu) menu = makeMenuButton();

  // Keep the expander anchored at the far right. When actions expand, they appear to its left,
  // so the same thumb target stays in the same place for expand/collapse.
  if (menu.parentElement !== actionBox || menu !== actionBox.lastElementChild) {
    actionBox.appendChild(menu);
  }

  const isMobile = window.matchMedia('(max-width: 639px)').matches;
  if (!isMobile) {
    actionBox.style.flexWrap = 'nowrap';
    menu.style.display = 'none';
    setButtons(actionButtons, true);
    setPreview(actionBox, false);
    setTypeBadge(card, actionBox, false, false);
    actionBox.dataset.actionsExpanded = 'false';
    return;
  }

  actionBox.style.alignItems = 'center';
  actionBox.style.justifyContent = 'flex-end';
  menu.style.display = '';
  const expanded = actionBox.dataset.actionsExpanded === 'true';
  actionBox.style.flexWrap = expanded ? 'wrap' : 'nowrap';
  setButtons(actionButtons, expanded);
  setPreview(actionBox, expanded);
  setTypeBadge(card, actionBox, expanded, true);
  menu.style.background = expanded ? '#E4ECE6' : '';
  menu.style.color = expanded ? '#7E9B86' : '';

  if (menu.dataset.bound === 'true') return;
  menu.dataset.bound = 'true';
  menu.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const nextExpanded = actionBox.dataset.actionsExpanded !== 'true';
    actionBox.dataset.actionsExpanded = String(nextExpanded);
    actionBox.style.flexWrap = nextExpanded ? 'wrap' : 'nowrap';
    setButtons(actionButtons, nextExpanded);
    setPreview(actionBox, nextExpanded);
    setTypeBadge(card, actionBox, nextExpanded, true);
    menu!.style.background = nextExpanded ? '#E4ECE6' : '';
    menu!.style.color = nextExpanded ? '#7E9B86' : '';
  });
}

function enhance() {
  document.querySelectorAll<HTMLElement>('[data-exercise-card-id]').forEach(enhanceCard);
}

export default function ExerciseCardMobileEnhancer() {
  useEffect(() => {
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', enhance);
    const id = window.setInterval(enhance, 800);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', enhance);
      window.clearInterval(id);
    };
  }, []);

  return null;
}
