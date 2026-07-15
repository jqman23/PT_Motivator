'use client';

import { useEffect, useRef, useState } from 'react';

const EMPTY_DRAFT = {
  mode: 'reps',
  kindText: 'REP',
  sets: '',
  value: '',
  durationUnit: 'sec',
  scopeMultiplier: 1,
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
  const title = card.querySelector('.text-sm.font-semibold > span');
  if (!title) return 'Exercise';
  return Array.from(title.childNodes)
    .filter(node => !(node instanceof Element && node.dataset.dailyExerciseMetric === 'true'))
    .map(node => node.textContent || '')
    .join('')
    .replace('(optional)', '')
    .trim() || 'Exercise';
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
  return mode === 'duration' ? 'DUR' : 'REP';
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
    scopeMultiplier: metric.scope_multiplier === 2 || metric.scope_multiplier === 4 ? metric.scope_multiplier : 1,
    weight: numberString(metric.weight_value),
    weightUnit: metric.weight_unit === 'kg' ? 'kg' : 'lb',
  };
}

function draftFromPrescription(prescription) {
  if (!prescription || !Number(prescription.amount)) return { draft: { ...EMPTY_DRAFT }, placeholders: { sets: '3', value: '10' } };
  const mode = prescription.unit === 'seconds' ? 'duration' : 'reps';
  const seconds = Number(prescription.amount);
  const useMinutes = mode === 'duration' && seconds >= 60 && seconds % 60 === 0;
  return {
    draft: {
      ...EMPTY_DRAFT,
      mode,
      kindText: kindLabel(mode),
      durationUnit: useMinutes ? 'min' : 'sec',
      scopeMultiplier: prescription.scopeMultiplier === 2 || prescription.scopeMultiplier === 4
        ? prescription.scopeMultiplier
        : 1,
    },
    placeholders: {
      sets: numberString(prescription.sets) || '3',
      value: numberString(useMinutes ? seconds / 60 : seconds) || (mode === 'duration' ? '45' : '10'),
    },
  };
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
  const [placeholders, setPlaceholders] = useState({ sets: '3', value: '10' });
  const dirtyRef = useRef(false);
  const setsRef = useRef(null);
  const valueRef = useRef(null);
  const kindRef = useRef(null);

  useEffect(() => {
    const openQuickLog = event => {
      const exerciseId = event.detail?.exerciseId;
      const card = exerciseId
        ? document.querySelector(`[data-exercise-card-id="${CSS.escape(exerciseId)}"]`)
        : null;
      if (!card) return;
      const title = card.querySelector('.text-sm.font-semibold');
      const rect = (title || card).getBoundingClientRect();
      const halfWidth = 125;
      const x = Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, event.detail?.clientX || rect.left + rect.width / 2));
      const placeBelow = rect.top < 130;
      const y = placeBelow ? rect.bottom + 5 : rect.top - 5;

      setActive({
        exerciseId: card.dataset.exerciseCardId,
        exerciseName: exerciseNameFromCard(card),
        date: selectedDateFromPage(),
        x,
        y,
        placeBelow,
        prescription: event.detail?.prescription || null,
      });
    };

    window.addEventListener('pt-exercise-quick-log', openQuickLog);
    return () => window.removeEventListener('pt-exercise-quick-log', openQuickLog);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const loadMetric = async () => {
      dirtyRef.current = false;
      setLoading(true);
      setSaving(false);
      setError('');
      setHasCurrent(false);
      setSeededFromLast(false);
      const programmed = draftFromPrescription(active.prescription);
      setDraft(programmed.draft);
      setPlaceholders(programmed.placeholders);

      try {
        const response = await fetch(`/api/exercise-metrics?date=${encodeURIComponent(active.date)}&exerciseId=${encodeURIComponent(active.exerciseId)}`, {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load.');
        if (cancelled) return;
        setHasCurrent(Boolean(data.current));
        setSeededFromLast(!data.current && Boolean(active.prescription));
        if (!dirtyRef.current && data.current) setDraft(draftFromMetric(data.current));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadMetric();

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
        window.dispatchEvent(new CustomEvent('pt-exercise-metric-saved', {
          detail: { exerciseId: active.exerciseId },
        }));
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
          weight: mode === 'reps' ? draft.weight || null : null,
          weightUnit: draft.weightUnit,
          scopeMultiplier: draft.scopeMultiplier,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save.');
      dirtyRef.current = false;
      window.dispatchEvent(new CustomEvent('pt-exercise-metric-saved', {
        detail: { exerciseId: active.exerciseId },
      }));
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
      <form
        data-pt-quick-log="true"
        className="fixed z-[110] rounded-xl border border-stone-200 bg-[#F6F1E7] p-2 shadow-2xl"
        style={{
          width: 'min(250px, calc(100vw - 16px))',
          left: active.x,
          top: active.y,
          transform: active.placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        onSubmit={event => {
          event.preventDefault();
          void saveAndClose();
        }}
      >
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[11px] font-bold text-stone-700">{active.exerciseName}</p>
          {loading && <span className="text-[9px] text-stone-400">loading</span>}
          {saving && <span className="text-[9px] text-stone-400">saving</span>}
          {seededFromLast && !loading && !saving && <span className="text-[9px] text-stone-400">programmed</span>}
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
              enterKeyHint="done"
              value={draft.sets}
              onChange={event => {
                const next = event.target.value.replace(/\D/g, '').slice(0, 1);
                updateDraft({ sets: next });
                if (next.length === 1) focusAndSelect(valueRef);
              }}
              placeholder={placeholders.sets}
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
              enterKeyHint="done"
              value={draft.value}
              onChange={event => {
                const next = event.target.value.replace(/\D/g, '').slice(0, 3);
                updateDraft({ value: next });
                if (next.length === 2) focusAndSelect(kindRef);
              }}
              placeholder={placeholders.value}
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
                enterKeyHint="done"
                list="exercise-entry-kind-options"
                value={draft.kindText}
                onFocus={event => event.currentTarget.select()}
                onChange={event => {
                  const typed = event.target.value;
                  const nextMode = modeFromKind(typed, draft.mode);
                  const kindText = /^[dr]/i.test(typed) ? kindLabel(nextMode) : typed;
                  updateDraft({ kindText, mode: nextMode });
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
                  className="shrink-0 text-[8px] font-bold leading-none text-stone-400"
                  title="Toggle seconds or minutes"
                >
                  {draft.durationUnit}
                </button>
              )}
              <button
                type="button"
                onClick={() => updateDraft({
                  scopeMultiplier: draft.scopeMultiplier === 1 ? 2 : draft.scopeMultiplier === 2 ? 4 : 1,
                })}
                className="min-w-8 shrink-0 rounded-md bg-stone-100 px-1.5 py-1 text-center text-[11px] font-black leading-none text-stone-600"
                aria-label={`Scope multiplier ${draft.scopeMultiplier}. Tap for next multiplier.`}
                title="×1 one side; ×2 both legs or directions; ×4 both legs and both directions"
              >
                ×{draft.scopeMultiplier}
              </button>
            </div>
            <datalist id="exercise-entry-kind-options">
              <option value="REP" />
              <option value="DUR" />
            </datalist>
          </label>
        </div>

        {draft.mode === 'reps' && (
          <label className="mt-1.5 flex items-center gap-2 rounded-lg bg-white px-2 py-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-stone-400">Weight</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.weight}
              onChange={event => {
                const next = event.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 7);
                updateDraft({ weight: next });
              }}
              placeholder="Optional"
              className="min-w-0 flex-1 bg-transparent text-right font-semibold text-stone-700 outline-none"
              style={{ fontSize: 16 }}
              aria-label="Weight used"
            />
            <button
              type="button"
              onClick={() => updateDraft({ weightUnit: draft.weightUnit === 'lb' ? 'kg' : 'lb' })}
              className="min-w-8 rounded-md bg-stone-100 px-1.5 py-1 text-[10px] font-black uppercase text-stone-500"
              aria-label={`Weight unit ${draft.weightUnit}. Tap to change.`}
              title="Toggle pounds or kilograms"
            >
              {draft.weightUnit}
            </button>
          </label>
        )}

        {draft.mode === 'reps' && draft.scopeMultiplier > 1 && draft.sets && draft.value && (
          <p className="mt-1 text-right text-[9px] font-semibold text-stone-500">
            {Number(draft.sets) * Number(draft.value) * draft.scopeMultiplier} total reps
          </p>
        )}

        {error && <p className="mt-1 truncate text-[9px] text-red-500">{error}</p>}
      </form>
    </>
  );
}
