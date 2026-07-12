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

function showImagePreview(imageUrl: string, exerciseName: string) {
  document.querySelector('[data-exercise-image-preview="true"]')?.remove();

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.dataset.exerciseImagePreview = 'true';
  backdrop.setAttribute('aria-label', `Close image preview for ${exerciseName}`);
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '200',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    border: '0',
    background: 'rgba(28, 31, 27, .72)',
  });

  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = exerciseName;
  Object.assign(image.style, {
    maxWidth: 'min(92vw, 560px)',
    maxHeight: '82vh',
    objectFit: 'contain',
    borderRadius: '18px',
    background: 'white',
    boxShadow: '0 18px 55px rgba(0, 0, 0, .3)',
  });
  image.addEventListener('click', event => event.stopPropagation());
  backdrop.addEventListener('click', () => backdrop.remove());
  backdrop.append(image);
  document.body.append(backdrop);
}

function syncPrimaryImage(card: HTMLElement, imageUrl?: string, animateIn = false) {
  const existing = card.querySelector<HTMLButtonElement>('[data-exercise-thumbnail="true"]');
  const actionArea = card.lastElementChild as HTMLElement | null;
  const actionsExpanded = actionArea?.dataset.actionsExpanded === 'true';
  const shouldShow = Boolean(imageUrl && !cardIsDone(card) && !actionsExpanded);

  if (!shouldShow) {
    existing?.remove();
    return;
  }

  if (existing) {
    const img = existing.querySelector('img');
    if (img && img.getAttribute('src') !== imageUrl) img.setAttribute('src', imageUrl!);
    return;
  }

  const exerciseName = card.querySelector<HTMLElement>('.text-sm.font-semibold')?.textContent?.trim() || 'exercise';
  const thumbnail = document.createElement('button');
  thumbnail.type = 'button';
  thumbnail.dataset.exerciseThumbnail = 'true';
  thumbnail.setAttribute('aria-label', `Enlarge image for ${exerciseName}`);
  Object.assign(thumbnail.style, {
    width: animateIn ? '0' : '56px',
    height: '56px',
    flex: animateIn ? '0 0 0' : '0 0 56px',
    padding: '2px',
    border: '1px solid #e7e5e4',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'white',
    touchAction: 'manipulation',
    opacity: animateIn ? '0' : '1',
    transform: animateIn ? 'scale(.86)' : 'scale(1)',
    transition: 'width 160ms ease, flex-basis 160ms ease, opacity 130ms ease, transform 160ms ease',
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
    showImagePreview(img.src, exerciseName);
  });
  thumbnail.addEventListener('pointerdown', event => event.stopPropagation());
  thumbnail.append(img);

  const typeBadge = card.querySelector('[data-mobile-primary-type="true"]');
  if (typeBadge) card.insertBefore(thumbnail, typeBadge);
  else if (actionArea) card.insertBefore(thumbnail, actionArea);
  else card.append(thumbnail);

  if (animateIn) window.requestAnimationFrame(() => {
    thumbnail.style.width = '56px';
    thumbnail.style.flexBasis = '56px';
    thumbnail.style.opacity = '1';
    thumbnail.style.transform = 'scale(1)';
  });
}

export default function ExerciseTileMetadataEnhancer() {
  useEffect(() => {
    let cancelled = false;
    let imageMap = new Map<string, string>();
    let lastDate = selectedDateFromPage();
    const metricRequest = new Map<string, number>();

    const loadImages = async () => {
      try {
        const response = await fetch('/api/config?key=exerciseLibrary', { cache: 'no-store' });
        const data = await response.json();
        const library: ExerciseImage[] = Array.isArray(data.value) ? data.value : [];
        imageMap = new Map(
          library
            .map(exercise => [exercise.id || '', exercise.mainImageUrl || exercise.mainImageUrls?.[0] || ''] as const)
            .filter(([id, url]) => Boolean(id && url)),
        );
        scanCards(true);
      } catch {
        imageMap = new Map();
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
    const onActionsToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ card?: HTMLElement; expanded?: boolean }>).detail;
      const card = detail?.card;
      if (!card) return;
      const exerciseId = card.dataset.exerciseCardId || '';
      const thumbnail = card.querySelector<HTMLElement>('[data-exercise-thumbnail="true"]');
      if (detail.expanded) {
        if (!thumbnail) return;
        thumbnail.style.width = '0';
        thumbnail.style.flexBasis = '0';
        thumbnail.style.opacity = '0';
        thumbnail.style.transform = 'scale(.86)';
        window.setTimeout(() => thumbnail.remove(), 165);
      } else {
        syncPrimaryImage(card, imageMap.get(exerciseId), true);
      }
    };

    const observer = new MutationObserver(() => scanCards(false));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('click', onClick, true);
    window.addEventListener('pt-exercise-metric-saved', onMetricSaved);
    window.addEventListener('pt-exercise-actions-toggle', onActionsToggle);

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
      window.removeEventListener('pt-exercise-actions-toggle', onActionsToggle);
      window.clearInterval(dateTimer);
      document.querySelector('[data-exercise-image-preview="true"]')?.remove();
    };
  }, []);

  return null;
}
