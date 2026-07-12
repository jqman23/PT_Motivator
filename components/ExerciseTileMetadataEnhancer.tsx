'use client';

import { useEffect } from 'react';

type ExerciseImage = {
  id?: string;
  mainImageUrl?: string;
  mainImageUrls?: string[];
};

type MetricRow = {
  sets_count?: number | string | null;
  reps_count?: number | string | null;
  duration_seconds?: number | string | null;
  scope_multiplier?: number | string | null;
};

let previewCleanup: (() => void) | null = null;

function localDateString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function selectedDateFromPage() {
  const previousDay = document.querySelector('button[aria-label="Previous day"]');
  const controls = previousDay?.parentElement;
  const match = controls?.textContent?.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || localDateString();
}

function metricLabel(metric: MetricRow | null | undefined) {
  if (!metric) return '';
  const sets = Number(metric.sets_count || 0);
  const reps = Number(metric.reps_count || 0);
  const seconds = Number(metric.duration_seconds || 0);
  const scope = [2, 4].includes(Number(metric.scope_multiplier)) ? Number(metric.scope_multiplier) : 1;
  if (!sets) return '';
  if (reps) {
    const base = `${sets}×${reps} reps`;
    return scope > 1 ? `${base} ×${scope} (${sets * reps * scope} total)` : base;
  }
  if (seconds) return `${sets}×${seconds} ${seconds === 1 ? 'sec' : 'secs'}`;
  return '';
}

function cardIsDone(card: HTMLElement) {
  const grip = card.querySelector<HTMLElement>('[title="Move exercise"]');
  const checkbox = grip?.nextElementSibling;
  return Boolean(checkbox?.querySelector('svg'));
}

function showImagePreview(imageUrls: string[], exerciseName: string) {
  previewCleanup?.();
  const images = Array.from(new Set(imageUrls.filter(Boolean)));
  if (!images.length) return;
  let activeIndex = 0;
  let swipeStartX: number | null = null;

  const backdrop = document.createElement('div');
  backdrop.dataset.exerciseImagePreview = 'true';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-label', `Images for ${exerciseName}`);
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '200',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'rgba(28, 31, 27, .72)',
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'min(92vw, 560px)',
    height: 'min(82vh, 700px)',
    touchAction: 'pan-y',
  });

  const image = document.createElement('img');
  image.alt = exerciseName;
  Object.assign(image.style, {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: '18px',
    background: 'white',
    boxShadow: '0 18px 55px rgba(0, 0, 0, .3)',
  });

  const counter = document.createElement('div');
  Object.assign(counter.style, {
    position: 'absolute',
    left: '50%',
    bottom: '10px',
    transform: 'translateX(-50%)',
    padding: '4px 9px',
    borderRadius: '999px',
    color: 'white',
    background: 'rgba(28, 31, 27, .7)',
    fontSize: '12px',
    fontWeight: '700',
  });

  const makeControl = (label: string, symbol: string, side: 'left' | 'right') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.textContent = symbol;
    Object.assign(button.style, {
      position: 'absolute',
      [side]: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '42px',
      height: '42px',
      border: '0',
      borderRadius: '999px',
      color: '#353B33',
      background: 'rgba(255, 255, 255, .9)',
      fontSize: '28px',
      lineHeight: '1',
      zIndex: '1',
    });
    return button;
  };
  const previous = makeControl('Previous exercise image', '‹', 'left');
  const next = makeControl('Next exercise image', '›', 'right');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close image gallery');
  closeButton.textContent = '×';
  Object.assign(closeButton.style, {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '36px',
    height: '36px',
    border: '0',
    borderRadius: '999px',
    color: '#353B33',
    background: 'rgba(255, 255, 255, .92)',
    fontSize: '24px',
    lineHeight: '1',
    zIndex: '2',
  });

  const render = () => {
    image.src = images[activeIndex];
    counter.textContent = `${activeIndex + 1} / ${images.length}`;
    previous.style.display = images.length > 1 ? '' : 'none';
    next.style.display = images.length > 1 ? '' : 'none';
    counter.style.display = images.length > 1 ? '' : 'none';
  };
  const move = (direction: -1 | 1) => {
    activeIndex = (activeIndex + direction + images.length) % images.length;
    render();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'ArrowRight') move(1);
  };
  const close = () => {
    window.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
    previewCleanup = null;
  };

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  panel.addEventListener('pointerdown', event => { swipeStartX = event.clientX; });
  panel.addEventListener('pointerup', event => {
    if (swipeStartX === null) return;
    const distance = event.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(distance) >= 45) move(distance < 0 ? 1 : -1);
  });

  panel.append(image, previous, next, closeButton, counter);
  backdrop.append(panel);
  document.body.append(backdrop);
  window.addEventListener('keydown', onKeyDown);
  previewCleanup = close;
  render();
}

function syncPrimaryImage(card: HTMLElement, imageUrls: string[] = []) {
  const imageUrl = imageUrls[0];
  const existing = card.querySelector<HTMLButtonElement>('[data-exercise-thumbnail="true"]');
  const actionArea = card.lastElementChild as HTMLElement | null;
  const actionsExpanded = actionArea?.dataset.actionsExpanded === 'true';
  const shouldShow = Boolean(imageUrl && !cardIsDone(card));

  if (!shouldShow) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.style.display = actionsExpanded ? 'none' : '';
    existing.dataset.exerciseImages = JSON.stringify(imageUrls);
    const img = existing.querySelector('img');
    if (img && img.getAttribute('src') !== imageUrl) img.setAttribute('src', imageUrl!);
    return;
  }

  const exerciseName = card.querySelector<HTMLElement>('.text-sm.font-semibold')?.textContent?.trim() || 'exercise';
  const thumbnail = document.createElement('button');
  thumbnail.type = 'button';
  thumbnail.dataset.exerciseThumbnail = 'true';
  thumbnail.dataset.exerciseImages = JSON.stringify(imageUrls);
  thumbnail.setAttribute('aria-label', `Enlarge image for ${exerciseName}`);
  Object.assign(thumbnail.style, {
    width: '56px',
    height: '56px',
    flex: '0 0 56px',
    padding: '2px',
    border: '1px solid #e7e5e4',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'white',
    touchAction: 'manipulation',
    display: actionsExpanded ? 'none' : '',
  });

  const img = document.createElement('img');
  img.src = imageUrl!;
  img.alt = '';
  Object.assign(img.style, {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: 'center',
    display: 'block',
    opacity: '1',
    borderRadius: '9px',
  });

  thumbnail.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const savedImages = JSON.parse(thumbnail.dataset.exerciseImages || '[]');
    showImagePreview(Array.isArray(savedImages) ? savedImages : [img.src], exerciseName);
  });
  thumbnail.addEventListener('pointerdown', event => event.stopPropagation());
  thumbnail.append(img);

  const typeBadge = card.querySelector('[data-mobile-primary-type="true"]');
  if (typeBadge) card.insertBefore(thumbnail, typeBadge);
  else if (actionArea) card.insertBefore(thumbnail, actionArea);
  else card.append(thumbnail);

}

export default function ExerciseTileMetadataEnhancer() {
  useEffect(() => {
    let cancelled = false;
    let imageMap = new Map<string, string[]>();
    let imageRevision = 0;
    let lastDate = selectedDateFromPage();
    const metricRequest = new Map<string, number>();

    const loadImages = async () => {
      const requestRevision = imageRevision;
      try {
        const response = await fetch('/api/config?key=exerciseLibrary', { cache: 'no-store' });
        const data = await response.json();
        const library: ExerciseImage[] = Array.isArray(data.value) ? data.value : [];
        const loadedMap = new Map(
          library
            .map(exercise => [exercise.id || '', Array.from(new Set([
              exercise.mainImageUrl,
              ...(exercise.mainImageUrls || []),
            ].filter((url): url is string => Boolean(url))))] as const)
            .filter(([id, urls]) => Boolean(id && urls.length)),
        );
        if (requestRevision !== imageRevision) {
          imageMap.forEach((urls, exerciseId) => loadedMap.set(exerciseId, urls));
        }
        imageMap = loadedMap;
        scanCards(true);
      } catch {
        if (requestRevision === imageRevision) imageMap = new Map();
      }
    };

    const loadMetric = async (card: HTMLElement, force = false) => {
      const exerciseId = card.dataset.exerciseCardId;
      if (!exerciseId) return;
      const date = selectedDateFromPage();
      const key = `${date}:${exerciseId}`;
      const title = card.querySelector<HTMLElement>('.text-sm.font-semibold > span');
      if (!title) return;

      let badge = title.querySelector<HTMLElement>('[data-daily-exercise-metric="true"]');
      if (!force && badge?.dataset.metricKey === key) return;

      const requestId = (metricRequest.get(exerciseId) || 0) + 1;
      metricRequest.set(exerciseId, requestId);

      try {
        const response = await fetch(`/api/exercise-metrics?date=${encodeURIComponent(date)}&exerciseId=${encodeURIComponent(exerciseId)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || cancelled || metricRequest.get(exerciseId) !== requestId) return;
        const label = metricLabel(data.current);

        badge = title.querySelector<HTMLElement>('[data-daily-exercise-metric="true"]');
        if (!label) {
          badge?.remove();
          return;
        }
        if (!badge) {
          badge = document.createElement('span');
          badge.dataset.dailyExerciseMetric = 'true';
          badge.className = 'ml-1 text-[11px] font-semibold text-stone-500';
          title.append(badge);
        }
        badge.dataset.metricKey = key;
        badge.textContent = `(${label})`;
      } catch {
        // Keep the tile usable if metric loading fails.
      }
    };

    const scanCards = (forceMetrics = false) => {
      document.querySelectorAll<HTMLElement>('[data-exercise-card-id]').forEach(card => {
        const exerciseId = card.dataset.exerciseCardId || '';
        syncPrimaryImage(card, imageMap.get(exerciseId));
        void loadMetric(card, forceMetrics);
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[aria-label="Save and close quick exercise log"]')) {
        window.setTimeout(() => scanCards(true), 700);
        window.setTimeout(() => scanCards(true), 1400);
      }
      if (target?.closest('[data-mobile-action-menu="true"]')) return;
      const card = target?.closest<HTMLElement>('[data-exercise-card-id]');
      if (card) window.setTimeout(() => syncPrimaryImage(card, imageMap.get(card.dataset.exerciseCardId || '')), 50);
    };
    const onMetricSaved = () => scanCards(true);
    const onImagesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ exerciseId?: string; images?: string[] }>).detail;
      if (!detail?.exerciseId || !Array.isArray(detail.images)) return;
      imageRevision += 1;
      imageMap.set(detail.exerciseId, detail.images);
      document
        .querySelectorAll<HTMLElement>(`[data-exercise-card-id="${CSS.escape(detail.exerciseId)}"]`)
        .forEach(card => syncPrimaryImage(card, detail.images));
    };

    const observer = new MutationObserver(() => scanCards(false));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('click', onClick, true);
    window.addEventListener('pt-exercise-metric-saved', onMetricSaved);
    window.addEventListener('pt-exercise-images-updated', onImagesUpdated);

    const dateTimer = window.setInterval(() => {
      const nextDate = selectedDateFromPage();
      if (nextDate !== lastDate) {
        lastDate = nextDate;
        scanCards(true);
      } else {
        scanCards(false);
      }
    }, 800);

    void loadImages();
    scanCards(true);

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pt-exercise-metric-saved', onMetricSaved);
      window.removeEventListener('pt-exercise-images-updated', onImagesUpdated);
      window.clearInterval(dateTimer);
      previewCleanup?.();
    };
  }, []);

  return null;
}
