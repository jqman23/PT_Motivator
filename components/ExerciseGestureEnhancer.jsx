'use client';

import { useEffect, useState } from 'react';

const HOLD_MS = 1000;
const DOUBLE_TAP_MS = 285;
const MOVE_TOLERANCE = 12;
const EMPTY_DRAFT = {
  mode: 'reps',
  sets: '',
  reps: '',
  duration: '',
  durationUnit: 'sec',
  weight: '',
  weightUnit: 'lb',
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

function exerciseNameFromCard(card) {
  const title = card.querySelector('.text-sm.font-semibold');
  return title?.textContent?.replace('(optional)', '').trim() || 'Exercise';
}

function numberString(value) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : '';
}

function draftFromMetric(metric) {
  let fallbackWeightUnit = 'lb';
  try {
    fallbackWeightUnit = localStorage.getItem('pt-exercise-weight-unit') === 'kg' ? 'kg' : 'lb';
  } catch {}

  if (!metric) return { ...EMPTY_DRAFT, weightUnit: fallbackWeightUnit };

  const seconds = Number(metric.duration_seconds || 0);
  const useMinutes = seconds >= 60 && seconds % 60 === 0;
  return {
    mode: seconds > 0 ? 'duration' : 'reps',
    sets: numberString(metric.sets_count),
    reps: numberString(metric.reps_count),
    duration: seconds > 0 ? String(useMinutes ? seconds / 60 : seconds) : '',
    durationUnit: useMinutes ? 'min' : 'sec',
    weight: numberString(metric.weight_value),
    weightUnit: metric.weight_unit === 'kg' ? 'kg' : fallbackWeightUnit,
  };
}

function preventCardAction(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest('button, input, textarea, select, a, [role="button"]'));
}

export default function ExerciseGestureEnhancer() {
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasCurrent, setHasCurrent] = useState(false);
  const [seededFromLast, setSeededFromLast] = useState(false);

  useEffect(() => {
    const cleanups = new Map();

    const openQuickLog = (card, clientX) => {
      const title = card.querySelector('.text-sm.font-semibold');
      const rect = (title || card).getBoundingClientRect();
      const halfWidth = 119;
      const x = Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, clientX || rect.left + rect.width / 2));
      const placeBelow = rect.top < 145;
      const y = placeBelow ? rect.bottom + 6 : rect.top - 6;

      setActive({
        exerciseId: card.dataset.exerciseCardId,
        exerciseName: exerciseNameFromCard(card),
        date: selectedDateFromPage(),
        x,
        y,
        placeBelow,
      });
    };

    const bindCard = card => {
      if (cleanups.has(card)) return;

      let holdTimer = null;
      let singleTapTimer = null;
      let pointerStart = null;
      let lastTapAt = 0;
      let lastPointerType = 'touch';
      let blockNextClick = false;

      const clearHold = () => {
        if (holdTimer) window.clearTimeout(holdTimer);
        holdTimer = null;
      };

      const clearSingleTap = () => {
        if (singleTapTimer) window.clearTimeout(singleTapTimer);
        singleTapTimer = null;
      };

      const onPointerDown = event => {
        if (isInteractiveTarget(event.target)) return;
        lastPointerType = event.pointerType || 'touch';
        if (lastPointerType === 'mouse') return;

        pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, pointerType: lastPointerType };
        clearHold();
        holdTimer = window.setTimeout(() => {
          if (!pointerStart) return;
          blockNextClick = true;
          clearSingleTap();
          lastTapAt = 0;
          try {
            card.dispatchEvent(new PointerEvent('pointercancel', {
              bubbles: true,
              pointerId: pointerStart.pointerId,
              pointerType: pointerStart.pointerType,
            }));
          } catch {}
          try { navigator.vibrate?.(18); } catch {}
          card.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: pointerStart.x,
            clientY: pointerStart.y,
          }));
          pointerStart = null;
        }, HOLD_MS);
      };

      const onPointerMove = event => {
        if (!pointerStart) return;
        if (
          Math.abs(event.clientX - pointerStart.x) > MOVE_TOLERANCE ||
          Math.abs(event.clientY - pointerStart.y) > MOVE_TOLERANCE
        ) {
          clearHold();
          pointerStart = null;
        }
      };

      const onPointerEnd = () => {
        clearHold();
        pointerStart = null;
      };

      const onClick = event => {
        if (card.dataset.exerciseGestureSynthetic === 'true') return;
        if (isInteractiveTarget(event.target)) return;

        if (blockNextClick) {
          blockNextClick = false;
          preventCardAction(event);
          return;
        }

        const coarse = lastPointerType !== 'mouse' || window.matchMedia('(hover: none), (pointer: coarse)').matches;
        if (!coarse) return;

        preventCardAction(event);
        const now = Date.now();
        const isDoubleTap = now - lastTapAt <= DOUBLE_TAP_MS;

        if (isDoubleTap) {
          clearSingleTap();
          lastTapAt = 0;
          openQuickLog(card, event.clientX);
          return;
        }

        lastTapAt = now;
        clearSingleTap();
        singleTapTimer = window.setTimeout(() => {
          lastTapAt = 0;
          card.dataset.exerciseGestureSynthetic = 'true';
          card.click();
          delete card.dataset.exerciseGestureSynthetic;
        }, DOUBLE_TAP_MS);
      };

      const onDoubleClick = event => {
        if (isInteractiveTarget(event.target)) return;
        preventCardAction(event);
        openQuickLog(card, event.clientX);
      };

      card.addEventListener('pointerdown', onPointerDown, true);
      card.addEventListener('pointermove', onPointerMove, true);
      card.addEventListener('pointerup', onPointerEnd, true);
      card.addEventListener('pointercancel', onPointerEnd, true);
      card.addEventListener('pointerleave', onPointerEnd, true);
      card.addEventListener('click', onClick, true);
      card.addEventListener('dblclick', onDoubleClick, true);
      card.title = 'Tap to check off. Hold 1 second for history. Double tap for sets, reps or time, and weight.';

      cleanups.set(card, () => {
        clearHold();
        clearSingleTap();
        card.removeEventListener('pointerdown', onPointerDown, true);
        card.removeEventListener('pointermove', onPointerMove, true);
        card.removeEventListener('pointerup', onPointerEnd, true);
        card.removeEventListener('pointercancel', onPointerEnd, true);
        card.removeEventListener('pointerleave', onPointerEnd, true);
        card.removeEventListener('click', onClick, true);
        card.removeEventListener('dblclick', onDoubleClick, true);
      });
    };

    const scan = () => document.querySelectorAll('[data-exercise-card-id]').forEach(bindCard);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanups.forEach(cleanup => cleanup());
      cleanups.clear();
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setSaving(false);
    setError('');
    setHasCurrent(false);
    setSeededFromLast(false);
    setDraft(EMPTY_DRAFT);

    fetch(`/api/exercise-metrics?date=${encodeURIComponent(active.date)}&exerciseId=${encodeURIComponent(active.exerciseId)}`, {
      cache: 'no-store',
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load.');
        return data;
      })
      .then(data => {
        if (cancelled) return;
        const source = data.current || data.previous;
        setHasCurrent(Boolean(data.current));
        setSeededFromLast(!data.current && Boolean(data.previous));
        setDraft(draftFromMetric(source));
      })
      .catch(loadError => {
        if (!cancelled) {
          setDraft(draftFromMetric(null));
          setError(loadError instanceof Error ? loadError.message : 'Could not load.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [active]);

  const updateDraft = patch => setDraft(previous => ({ ...previous, ...patch }));

  const save = async () => {
    if (!active || saving || loading) return;
    const mainValue = draft.mode === 'reps' ? draft.reps : draft.duration;
    if (!draft.sets && !mainValue && !draft.weight) {
      setError('Add a value.');
      return;
    }

    setSaving(true);
    setError('');
    const durationSeconds = draft.mode === 'duration' && draft.duration
      ? Math.round(Number(draft.duration) * (draft.durationUnit === 'min' ? 60 : 1))
      : null;

    try {
      const response = await fetch('/api/exercise-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: active.date,
          exerciseId: active.exerciseId,
          sets: draft.sets || null,
          reps: draft.mode === 'reps' ? draft.reps || null : null,
          durationSeconds,
          weight: draft.weight || null,
          weightUnit: draft.weightUnit,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save.');
      try { localStorage.setItem('pt-exercise-weight-unit', draft.weightUnit); } catch {}
      setActive(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!active || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/exercise-metrics?date=${encodeURIComponent(active.date)}&exerciseId=${encodeURIComponent(active.exerciseId)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not clear.');
      setActive(null);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Could not clear.');
    } finally {
      setSaving(false);
    }
  };

  if (!active) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[109] cursor-default bg-transparent"
        aria-label="Close quick exercise log"
        onClick={() => !saving && setActive(null)}
      />
      <div
        className="fixed z-[110] rounded-xl border border-stone-200 bg-[#F6F1E7] p-2 shadow-2xl"
        style={{
          width: 'min(238px, calc(100vw - 16px))',
          left: active.x,
          top: active.y,
          transform: active.placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[11px] font-bold text-stone-700">{active.exerciseName}</p>
          {loading && <span className="text-[10px] text-stone-400">…</span>}
          {seededFromLast && !loading && <span className="text-[9px] text-stone-400">last</span>}
          <button
            type="button"
            onClick={() => !saving && setActive(null)}
            className="flex h-5 w-5 items-center justify-center rounded-md bg-white text-sm leading-none text-stone-400"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-1 flex gap-1">
          <button
            type="button"
            onClick={() => updateDraft({ mode: 'reps' })}
            className="rounded-md px-2 py-1 text-[10px] font-bold"
            style={{ background: draft.mode === 'reps' ? '#E4ECE6' : '#fff', color: draft.mode === 'reps' ? '#476653' : '#a8a29e' }}
          >
            Reps
          </button>
          <button
            type="button"
            onClick={() => updateDraft({ mode: 'duration' })}
            className="rounded-md px-2 py-1 text-[10px] font-bold"
            style={{ background: draft.mode === 'duration' ? '#E4ECE6' : '#fff', color: draft.mode === 'duration' ? '#476653' : '#a8a29e' }}
          >
            Time
          </button>
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <label className="rounded-lg bg-white px-1.5 py-1">
            <span className="block text-[8px] font-black uppercase tracking-wider text-stone-400">S</span>
            <input
              autoFocus
              type="number"
              min="1"
              max="99"
              inputMode="numeric"
              value={draft.sets}
              onChange={event => updateDraft({ sets: event.target.value })}
              placeholder="3"
              className="w-full bg-transparent text-base font-semibold text-stone-700 outline-none"
              style={{ fontSize: 16 }}
            />
          </label>

          <label className="rounded-lg bg-white px-1.5 py-1">
            <span className="block text-[8px] font-black uppercase tracking-wider text-stone-400">{draft.mode === 'reps' ? 'R' : 'T'}</span>
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={draft.mode === 'reps' ? draft.reps : draft.duration}
                onChange={event => updateDraft(draft.mode === 'reps' ? { reps: event.target.value } : { duration: event.target.value })}
                placeholder={draft.mode === 'reps' ? '10' : '45'}
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-stone-700 outline-none"
                style={{ fontSize: 16 }}
              />
              {draft.mode === 'duration' && (
                <button
                  type="button"
                  onClick={() => updateDraft({ durationUnit: draft.durationUnit === 'sec' ? 'min' : 'sec' })}
                  className="text-[8px] font-bold text-stone-400"
                >
                  {draft.durationUnit}
                </button>
              )}
            </div>
          </label>

          <label className="rounded-lg bg-white px-1.5 py-1">
            <span className="block text-[8px] font-black uppercase tracking-wider text-stone-400">W</span>
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={draft.weight}
                onChange={event => updateDraft({ weight: event.target.value })}
                placeholder="40"
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-stone-700 outline-none"
                style={{ fontSize: 16 }}
              />
              <button
                type="button"
                onClick={() => updateDraft({ weightUnit: draft.weightUnit === 'lb' ? 'kg' : 'lb' })}
                className="text-[8px] font-bold text-stone-400"
              >
                {draft.weightUnit}
              </button>
            </div>
          </label>
        </div>

        <div className="mt-1.5 flex items-center gap-1">
          {hasCurrent && (
            <button
              type="button"
              onClick={() => void clear()}
              disabled={saving}
              className="rounded-md px-1.5 py-1 text-[9px] font-semibold text-red-500 disabled:opacity-40"
            >
              Clear
            </button>
          )}
          {error && <span className="min-w-0 flex-1 truncate text-[9px] text-red-500">{error}</span>}
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving}
            className="ml-auto rounded-lg px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
            style={{ background: '#7E9B86' }}
          >
            {saving ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
