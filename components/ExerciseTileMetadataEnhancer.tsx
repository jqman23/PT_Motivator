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
  if (!sets) return '';
  if (reps) return `${sets}×${reps} reps`;
  if (seconds) return `${sets}×${seconds} ${seconds === 1 ? 'sec' : 'secs'}`;
  return '';
}

function cardIsDone(card: HTMLElement) {
  const grip = card.querySelector<HTMLElement>('[title="Move exercise"]');
  const checkbox = grip?.nextElementSibling;
  return Boolean(checkbox?.querySelector('svg'));
}

function syncPrimaryImage(card: HTMLElement, imageUrl?: string) {
  const existing = card.querySelector<HTMLElement>('[data-primary-image-rail="true"]');
  const grip = card.querySelector<HTMLElement>('[title="Move exercise"]');
  const checkbox = grip?.nextElementSibling as HTMLElement | null;
  const shouldShow = Boolean(imageUrl && grip && checkbox && !cardIsDone(card));

  if (!shouldShow) {
    existing?.remove();
    grip?.style.removeProperty('position');
    grip?.style.removeProperty('z-index');
    grip?.style.removeProperty('text-shadow');
    checkbox?.style.removeProperty('position');
    checkbox?.style.removeProperty('z-index');
    checkbox?.style.removeProperty('background-color');
    checkbox?.style.removeProperty('border-color');
    checkbox?.style.removeProperty('backdrop-filter');
    checkbox?.style.removeProperty('box-shadow');
    return;
  }

  card.style.position = 'relative';
  grip!.style.position = 'relative';
  grip!.style.zIndex = '3';
  grip!.style.textShadow = '0 1px 3px rgba(255,255,255,.98)';
  checkbox!.style.position = 'relative';
  checkbox!.style.zIndex = '3';
  checkbox!.style.backgroundColor = 'rgba(255,255,255,.78)';
  checkbox!.style.borderColor = 'rgba(255,255,255,.92)';
  checkbox!.style.backdropFilter = 'blur(2px)';
  checkbox!.style.boxShadow = '0 1px 5px rgba(53,59,51,.12)';

  if (existing) {
    const img = existing.querySelector('img');
    if (img && img.getAttribute('src') !== imageUrl) img.setAttribute('src', imageUrl!);
    return;
  }

  const rail = document.createElement('div');
  rail.dataset.primaryImageRail = 'true';
  Object.assign(rail.style, {
    position: 'absolute',
    inset: '0 auto 0 0',
    width: '96px',
    borderRadius: '16px 0 0 16px',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '0',
  });

  const img = document.createElement('img');
  img.src = imageUrl!;
  img.alt = '';
  Object.assign(img.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    display: 'block',
    opacity: '0.96',
  });

  const wash = document.createElement('div');
  Object.assign(wash.style, {
    position: 'absolute',
    inset: '0',
    background: 'linear-gradient(90deg, rgba(255,255,255,.02) 0%, rgba(255,255,255,.05) 68%, rgba(255,255,255,.28) 100%)',
  });

  rail.append(img, wash);
  card.prepend(rail);
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
      const card = target?.closest<HTMLElement>('[data-exercise-card-id]');
      if (card) window.setTimeout(() => syncPrimaryImage(card, imageMap.get(card.dataset.exerciseCardId || '')), 50);
    };

    const observer = new MutationObserver(() => scanCards(false));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('click', onClick, true);

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
      window.clearInterval(dateTimer);
    };
  }, []);

  return null;
}
