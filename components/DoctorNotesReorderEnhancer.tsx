'use client';

import { useEffect } from 'react';

const LOCAL_ORDER_KEY = 'pt-doctor-note-order-v1';
const CONFIG_ORDER_KEY = 'doctorNoteOrder';
const LONG_PRESS_MS = 550;

type PressStart = { pointerId: number; x: number; y: number };
type ReactFiber = { key?: string | null; return?: ReactFiber | null };

function readLocalOrder(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_ORDER_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function findNotesModal(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll('h2')).find(node => node.textContent?.trim() === 'Doctor notes');
  return (heading?.closest('div.fixed') as HTMLElement | null) ?? null;
}

function findNotesHome(modal: HTMLElement) {
  const search = modal.querySelector<HTMLInputElement>('input[placeholder="Search symptoms, doctors, dates…"]');
  if (!search) return null;
  const toolbar = search.parentElement as HTMLElement | null;
  const root = toolbar?.parentElement as HTMLElement | null;
  const article = root?.querySelector('article') as HTMLElement | null;
  if (!toolbar || !root || !article) return null;
  const wrapper = article.parentElement?.parentElement?.parentElement as HTMLElement | null;
  const list = wrapper?.parentElement as HTMLElement | null;
  if (!wrapper || !list || !list.contains(article)) return null;
  return { root, toolbar, list };
}

function noteWrappers(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !!child.querySelector('article'));
}

function articleFor(wrapper: HTMLElement): HTMLElement | null {
  return wrapper.querySelector('article');
}

function reactKeyFor(element: HTMLElement): string {
  const fiberProperty = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
  let fiber = fiberProperty ? (element as unknown as Record<string, ReactFiber>)[fiberProperty] : null;
  for (let depth = 0; fiber && depth < 18; depth += 1, fiber = fiber.return ?? null) {
    if (typeof fiber.key === 'string' && fiber.key.trim()) return fiber.key;
  }
  return '';
}

function fallbackKey(article: HTMLElement): string {
  const paragraphs = Array.from(article.querySelectorAll('p')).slice(0, 4).map(node => node.textContent?.trim() || '');
  const image = article.querySelector<HTMLImageElement>('img')?.src || '';
  return `fallback:${[...paragraphs, image.slice(-120)].join('|').slice(0, 700)}`;
}

function noteKey(wrapper: HTMLElement): string {
  const article = articleFor(wrapper);
  if (!article) return '';
  return reactKeyFor(article) || fallbackKey(article);
}

function button(label: string, ariaLabel: string) {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.setAttribute('aria-label', ariaLabel);
  Object.assign(control.style, {
    minHeight: '38px',
    minWidth: '52px',
    border: '0',
    borderRadius: '10px',
    background: '#E4ECE6',
    color: '#476653',
    fontSize: '18px',
    fontWeight: '800',
    touchAction: 'manipulation',
  });
  return control;
}

export default function DoctorNotesReorderEnhancer() {
  useEffect(() => {
    let modal: HTMLElement | null = null;
    let list: HTMLElement | null = null;
    let toolbar: HTMLElement | null = null;
    let active = false;
    let pressTimer: number | null = null;
    let pressStart: PressStart | null = null;
    let suppressClickUntil = 0;
    let applyingOrder = false;
    let scanFrame = 0;
    let order = readLocalOrder();

    const clearPress = () => {
      if (pressTimer !== null) window.clearTimeout(pressTimer);
      pressTimer = null;
      pressStart = null;
    };

    const saveOrder = (ids: string[]) => {
      order = ids.filter(Boolean);
      try { localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(order)); } catch {}
      void fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: CONFIG_ORDER_KEY, value: order }),
      }).catch(() => undefined);
    };

    const currentOrder = (targetList: HTMLElement) => noteWrappers(targetList).map(noteKey).filter(Boolean);

    const applySavedOrder = (targetList: HTMLElement) => {
      if (active || applyingOrder || order.length === 0) return;
      const wrappers = noteWrappers(targetList);
      if (wrappers.length < 2) return;
      const positions = new Map(order.map((id, index) => [id, index]));
      const desired = wrappers
        .map((wrapper, originalIndex) => ({ wrapper, originalIndex, position: positions.get(noteKey(wrapper)) }))
        .sort((a, b) => {
          const aKnown = Number.isInteger(a.position);
          const bKnown = Number.isInteger(b.position);
          if (aKnown && bKnown) return Number(a.position) - Number(b.position);
          if (aKnown !== bKnown) return aKnown ? 1 : -1;
          return a.originalIndex - b.originalIndex;
        })
        .map(item => item.wrapper);
      if (desired.every((wrapper, index) => wrapper === wrappers[index])) return;
      applyingOrder = true;
      desired.forEach(wrapper => targetList.appendChild(wrapper));
      applyingOrder = false;
    };

    const restoreElement = (element: HTMLElement) => {
      const display = element.dataset.reorderPreviousDisplay;
      element.style.display = display ?? '';
      delete element.dataset.reorderPreviousDisplay;
      delete element.dataset.reorderHidden;
    };

    const hideElement = (element: HTMLElement) => {
      if (element.dataset.reorderHidden === 'true') return;
      element.dataset.reorderPreviousDisplay = element.style.display;
      element.dataset.reorderHidden = 'true';
      element.style.display = 'none';
    };

    const refreshMoveButtons = () => {
      if (!list) return;
      const wrappers = noteWrappers(list);
      wrappers.forEach((wrapper, index) => {
        const controls = wrapper.querySelector<HTMLElement>('[data-note-reorder-controls="true"]');
        const up = controls?.querySelector<HTMLButtonElement>('[data-direction="up"]');
        const down = controls?.querySelector<HTMLButtonElement>('[data-direction="down"]');
        if (up) up.disabled = index === 0;
        if (down) down.disabled = index === wrappers.length - 1;
        if (up) up.style.opacity = up.disabled ? '0.25' : '1';
        if (down) down.style.opacity = down.disabled ? '0.25' : '1';
      });
    };

    const moveWrapper = (wrapper: HTMLElement, direction: -1 | 1) => {
      if (!list) return;
      const wrappers = noteWrappers(list);
      const index = wrappers.indexOf(wrapper);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= wrappers.length) return;
      const target = wrappers[targetIndex];
      if (direction < 0) list.insertBefore(wrapper, target);
      else list.insertBefore(target, wrapper);
      saveOrder(currentOrder(list));
      refreshMoveButtons();
    };

    const decorateWrapper = (wrapper: HTMLElement) => {
      const article = articleFor(wrapper);
      if (!article || article.querySelector('[data-note-reorder-controls="true"]')) return;
      article.dataset.noteReordering = 'true';
      article.style.cursor = 'default';
      article.style.borderColor = '#CAD9CF';
      article.style.boxShadow = '0 0 0 2px rgba(126, 155, 134, 0.18)';

      const directChildren = Array.from(article.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      const actionRow = directChildren.find(child => child.classList.contains('mt-2') && child.classList.contains('flex'));
      if (actionRow) hideElement(actionRow);
      Array.from(wrapper.children).slice(1).forEach(child => { if (child instanceof HTMLElement) hideElement(child); });

      const controls = document.createElement('div');
      controls.dataset.noteReorderControls = 'true';
      Object.assign(controls.style, { display: 'flex', gap: '8px', marginTop: '10px' });
      const up = button('↑', 'Move note up');
      const down = button('↓', 'Move note down');
      up.dataset.direction = 'up';
      down.dataset.direction = 'down';
      up.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); moveWrapper(wrapper, -1); });
      down.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); moveWrapper(wrapper, 1); });
      controls.append(up, down);
      article.appendChild(controls);
    };

    const exitMode = () => {
      if (!active) return;
      active = false;
      clearPress();
      if (modal) delete modal.dataset.doctorNoteReorderMode;
      document.querySelector('[data-note-reorder-banner="true"]')?.remove();
      if (toolbar) restoreElement(toolbar);
      if (list) {
        noteWrappers(list).forEach(wrapper => {
          const article = articleFor(wrapper);
          article?.querySelector('[data-note-reorder-controls="true"]')?.remove();
          if (article) {
            delete article.dataset.noteReordering;
            article.style.cursor = '';
            article.style.borderColor = '';
            article.style.boxShadow = '';
            Array.from(article.children).forEach(child => { if (child instanceof HTMLElement && child.dataset.reorderHidden === 'true') restoreElement(child); });
          }
          Array.from(wrapper.children).forEach(child => { if (child instanceof HTMLElement && child.dataset.reorderHidden === 'true') restoreElement(child); });
        });
        saveOrder(currentOrder(list));
      }
    };

    const enterMode = () => {
      if (active || !modal || !list || !toolbar || noteWrappers(list).length < 2) return;
      active = true;
      suppressClickUntil = Date.now() + 650;
      modal.dataset.doctorNoteReorderMode = 'true';
      hideElement(toolbar);

      const banner = document.createElement('div');
      banner.dataset.noteReorderBanner = 'true';
      Object.assign(banner.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '12px',
        padding: '10px 12px',
        border: '1px solid #CAD9CF',
        borderRadius: '16px',
        background: '#E4ECE6',
      });
      const copy = document.createElement('div');
      copy.innerHTML = '<strong style="display:block;color:#476653;font-size:14px">Reorder notes</strong><span style="color:#5F7666;font-size:11px">Use the arrows, then tap Done.</span>';
      const done = document.createElement('button');
      done.type = 'button';
      done.textContent = 'Done';
      Object.assign(done.style, { minHeight: '40px', padding: '8px 16px', border: '0', borderRadius: '12px', background: '#fff', color: '#476653', fontSize: '12px', fontWeight: '800' });
      done.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); exitMode(); });
      banner.append(copy, done);
      list.parentElement?.insertBefore(banner, list);
      noteWrappers(list).forEach(decorateWrapper);
      refreshMoveButtons();
      navigator.vibrate?.(25);
    };

    const ensureHint = (targetToolbar: HTMLElement, targetList: HTMLElement) => {
      const parent = targetToolbar.parentElement;
      if (!parent || active || noteWrappers(targetList).length < 2 || parent.querySelector('[data-note-reorder-hint="true"]')) return;
      const hint = document.createElement('p');
      hint.dataset.noteReorderHint = 'true';
      hint.textContent = 'Press and hold a note to reorder.';
      Object.assign(hint.style, { margin: '-4px 4px 12px', color: '#a8a29e', fontSize: '10px' });
      targetToolbar.insertAdjacentElement('afterend', hint);
    };

    const scan = () => {
      scanFrame = 0;
      const nextModal = findNotesModal();
      if (!nextModal) {
        if (active) exitMode();
        modal = null;
        list = null;
        toolbar = null;
        return;
      }
      const home = findNotesHome(nextModal);
      if (!home) return;
      const modalChanged = modal !== nextModal;
      modal = nextModal;
      list = home.list;
      toolbar = home.toolbar;
      applySavedOrder(list);
      ensureHint(toolbar, list);
      if (active) {
        noteWrappers(list).forEach(decorateWrapper);
        refreshMoveButtons();
      }
      if (modalChanged) {
        void fetch(`/api/config?key=${encodeURIComponent(CONFIG_ORDER_KEY)}`, { cache: 'no-store' })
          .then(response => response.json())
          .then(data => {
            if (Array.isArray(data.value)) {
              order = data.value.filter((item: unknown): item is string => typeof item === 'string');
              try { localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(order)); } catch {}
              if (list) applySavedOrder(list);
            }
          })
          .catch(() => undefined);
      }
    };

    const scheduleScan = () => {
      if (!scanFrame) scanFrame = window.requestAnimationFrame(scan);
    };

    const pointerDown = (event: PointerEvent) => {
      if (active || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const target = event.target instanceof Element ? event.target : null;
      const article = target?.closest('article') as HTMLElement | null;
      if (!article || target?.closest('button, input, textarea, select, a')) return;
      scan();
      if (!modal?.contains(article) || !list?.contains(article)) return;
      clearPress();
      pressStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      pressTimer = window.setTimeout(enterMode, LONG_PRESS_MS);
    };

    const pointerMove = (event: PointerEvent) => {
      if (!pressStart || pressStart.pointerId !== event.pointerId) return;
      if (Math.abs(event.clientX - pressStart.x) > 12 || Math.abs(event.clientY - pressStart.y) > 12) clearPress();
    };

    const preventNoteClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const article = target?.closest('article');
      if (!article || !modal?.contains(article)) return;
      if (target?.closest('[data-note-reorder-controls="true"], [data-note-reorder-banner="true"]')) return;
      if (active || Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const contextMenu = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('article') && modal?.contains(target)) event.preventDefault();
    };

    const keyDown = (event: KeyboardEvent) => {
      if (active && event.key === 'Escape') {
        event.preventDefault();
        exitMode();
      }
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointermove', pointerMove, true);
    document.addEventListener('pointerup', clearPress, true);
    document.addEventListener('pointercancel', clearPress, true);
    document.addEventListener('click', preventNoteClick, true);
    document.addEventListener('contextmenu', contextMenu, true);
    document.addEventListener('keydown', keyDown, true);
    scheduleScan();

    return () => {
      observer.disconnect();
      if (scanFrame) window.cancelAnimationFrame(scanFrame);
      clearPress();
      exitMode();
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointermove', pointerMove, true);
      document.removeEventListener('pointerup', clearPress, true);
      document.removeEventListener('pointercancel', clearPress, true);
      document.removeEventListener('click', preventNoteClick, true);
      document.removeEventListener('contextmenu', contextMenu, true);
      document.removeEventListener('keydown', keyDown, true);
    };
  }, []);

  return null;
}
