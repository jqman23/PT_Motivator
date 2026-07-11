'use client';

import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 1500;
const DOUBLE_TAP_MS = 285;
const MOVE_TOLERANCE = 12;
const EMPTY_DRAFT = {
  mode: 'reps',
  kindText: 'Reps',
  sets: '',
  value: '',
  durationUnit: 'sec',
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

function modeFromKind(value, fallback = 'reps') {
  const clean = String(value || '').trim().toLowerCase();
  if (clean.startsWith('d')) return 'duration';
  if (clean.startsWith('r')) return 'reps';
  return fallback;
}

function kindLabel(mode) {
  return mode === 'duration' ? 'Duration' : 'Reps';
}

function draftFromMetric(metric) {
  if (!metric) return { ...EMPTY_DRAFT };

  const durationSeconds = Number(metric.duration_seconds || 0);
  const mode = durationSeconds > 0 ? 'duration' : 'reps';
  const useMinutes = durationSeconds >= 60 && durationSeconds % 60 === 0;

  return {
    mode,
    kindText: kindLabel(mode),
    sets: numberString(metric.sets_count),
    value: mode === 'duration'
      ? String(useMinutes ? durationSeconds / 60 : durationSeconds)
      : numberString(metric.reps_count),
    durationUnit: useMinutes ? 'min' : 'sec',
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

function focusAndSelect(ref) {
  window.requestAnimationFrame(() => {
    ref.current?.focus();
    ref.current?.select();
  });
}

export default function ExerciseGestureEnhancer() {
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasCurrent, setHasCurrent] = useState(false);
  const [seededFromLast, setSeededFromLast] = useState(false);
  const [preservedWeight, setPreservedWeight] = useState(null);
  const [preservedWeightUnit, setPreservedWeightUnit] = useState('lb');
  const dirtyRef = useRef(false);
  const setsRef = useRef(null);
  const valueRef = useRef(null);
  const kindRef = useRef(null);

  useEffect(() => {
    const cleanups = new Map();

    const openQuickLog = (card, clientX) => {
      const title = card.querySelector('.text-sm.font-semibold');
      const rect = (title || card).getBoundingClientRect();
      const halfWidth = 113;
      const x = Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, clientX || rect.left + rect.width / 2));
      const placeBelow = rect.top < 130;
      const y = placeBelow ? rect.bottom + 5 : rect.top - 5;

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
          const holdPoint = pointerStart;
          blockNextClick = true;
          clearSingleTap();
          lastTapAt = 0;
          try {
            card.dispatchEvent(new PointerEvent('pointercancel', {
              bubbles: true,
              pointerId: holdPoint.pointerId,
              pointerType: holdPoint.pointerType,
            }));
          } catch {}
          try { navigator.vibrate?.(18); } catch {}
          card.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: holdPoint.x,
            clientY: holdPoint.y,
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
      card.title = 'Tap to check off. Hold 1.5 seconds for history. Double tap for quick sets and reps or duration.';

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
    dirtyRef.current = false;
    setLoading(true);
    setSaving(false);
    setError('');
    setHasCurrent(false);
    setSeededFromLast(false);
    setPreservedWeight(null);
    setPreservedWeightUnit('lb');
    setDraft({ ...EMPTY_DRAFT });

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
        setPreservedWeight(data.current?.weight_value ?? null);
        setPreservedWeightUnit(data.current?.weight_unit === 'kg' ? 'kg' : 'lb');
        if (!dirtyRef.current) setDraft(draftFromMetric(source));
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [active]);

  const updateDraft = patch => {
    dirtyRef.current = true;
    setError('');
    setDraft(previous => ({ ...previous, ...patch }));
  };

  const cancel = () => {
    if (saving) return;
    dirtyRef.current = false;
    setActive(null);
  };

  const saveAndClose = async () => {
    if (!active || saving || loading) return;
    if (!dirtyRef.current) {
      setActive(null);
      return;
    }

    const mode = modeFromKind(draft.kindText, draft.mode);
    const hasAnyValue = Boolean(draft.sets || draft.value);
    setSaving(true);
    setError('');

    try {
      if (!hasAnyValue) {
        if (hasCurrent) {
          const response = await fetch(`/api/exercise-metrics?date=${encodeURIComponent(active.date)}&exerciseId=${encodeURIComponent(active.exerciseId)}`, {
            method: 'DELETE',
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not clear.');
        }
        dirtyRef.current = false;
        setActive(null);
        return;
      }

      const durationSeconds = mode === 'duration' && draft.value
        ? Math.round(Number(draft.value) * (draft.durationUnit === 'min' ? 60 : 1))
        : null;
      const response = await fetch('/api/exercise-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: active.date,
          exerciseId: active.exerciseId,
          sets: draft.sets || null,
          reps: mode === 'reps' ? draft.value || null : null,
          durationSeconds,
          weight: preservedWeight,
          weightUnit: preservedWeightUnit,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save.');
      dirtyRef.current = false;
      setActive(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.');
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
        aria-label="Save and close quick exercise log"
        onClick={() => void saveAndClose()}
      />
      <div
        className="fixed z-[110] rounded-xl border border-stone-200 bg-[#F6F1E7] p-2 shadow-2xl"
        style={{
          width: 'min(226px, calc(100vw - 16px))',
          left: active.x,
          top: active.y,
          transform: active.placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[11px] font-bold text-stone-700">{active.exerciseName}</p>
          {loading && <span className="text-[9px] text-stone-400">loading</span>}
          {saving && <span className="text-[9px] text-stone-400">saving</span>}
          {seededFromLast && !loading && !saving && <span className="text-[9px] text-stone-400">last</span>}
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="flex h-5 w-5 items-center justify-center rounded-md bg-white text-sm leading-none text-stone-400 disabled:opacity-40"
            aria-label="Cancel quick log"
            title="Cancel without saving"
          >
            ×
          </button>
        </div>

        <div className="mt-1.5 grid grid-cols-[46px_58px_1fr] gap-1">
          <label className="rounded-lg bg-white px-1.5 py-1">
            <span className="block text-[8px] font-black uppercase tracking-wider text-stone-400">Sets</span>
            <input
              ref={setsRef}
              autoFocus
              type="text"
              inputMode="numeric"
              value={draft.sets}
              onChange={event => {
                const next = event.target.value.replace(/\D/g, '').slice(0, 1);
                updateDraft({ sets: next });
                if (next.length === 1) focusAndSelect(valueRef);
              }}
              placeholder="3"
              className="w-full bg-transparent text-base font-semibold text-stone-700 outline-none"
              style={{ fontSize: 16 }}
            />
          </label>

          <label className="rounded-lg bg-white px-1.5 py-1">
            <span className="block text-[8px] font-black uppercase tracking-wider text-stone-400">Value</span>
            <input
              ref={valueRef}
              type="text"
              inputMode="numeric"
              value={draft.value}
              onChange={event => {
                const next = event.target.value.replace(/\D/g, '').slice(0, 3);
                updateDraft({ value: next });
                if (next.length === 2) focusAndSelect(kindRef);
              }}
              placeholder={draft.mode === 'duration' ? '45' : '10'}
              className="w-full bg-transparent text-base font-semibold text-stone-700 outline-none"
              style={{ fontSize: 16 }}
            />
          </label>

          <label className="min-w-0 rounded-lg bg-white px-1.5 py-1">
            <span className="block text-[8px] font-black uppercase tracking-wider text-stone-400">Type</span>
            <div className="flex items-center gap-1">
              <input
                ref={kindRef}
                type="text"
                list="exercise-entry-kind-options"
                value={draft.kindText}
                onFocus={event => event.currentTarget.select()}
                onChange={event => {
                  const kindText = event.target.value;
                  updateDraft({ kindText, mode: modeFromKind(kindText, draft.mode) });
                }}
                onBlur={() => {
                  const mode = modeFromKind(draft.kindText, draft.mode);
                  setDraft(previous => ({ ...previous, mode, kindText: kindLabel(mode) }));
                }}
                placeholder="Reps"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-stone-700 outline-none"
                style={{ fontSize: 16 }}
              />
              {draft.mode === 'duration' && (
                <button
                  type="button"
                  onClick={() => updateDraft({ durationUnit: draft.durationUnit === 'sec' ? 'min' : 'sec' })}
                  className="shrink-0 text-[8px] font-bold text-stone-400"
                  title="Toggle seconds or minutes"
                >
                  {draft.durationUnit}
                </button>
              )}
            </div>
            <datalist id="exercise-entry-kind-options">
              <option value="Reps" />
              <option value="Duration" />
            </datalist>
          </label>
        </div>

        {error && <p className="mt-1 truncate text-[9px] text-red-500">{error}</p>}
      </div>
    </>
  );
}
