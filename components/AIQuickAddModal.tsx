'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;

type ExerciseChange = {
  id: string;
  completed?: boolean | null;
  note?: string | null;
  reason?: string;
};

type HealthChanges = Record<string, string | number | null | undefined>;

type Proposal = {
  summary: string[];
  exerciseChanges: ExerciseChange[];
  healthChanges: HealthChanges;
  questions: string[];
};

interface Props {
  date: string;
  layout: CategoryConfig[];
  exerciseMap: Record<string, Exercise>;
  log: LogMap;
  notes: NotesMap;
  onClose: () => void;
  onApply: (proposal: Proposal, previousHealth: HealthChanges | null, nextHealth: HealthChanges | null) => Promise<void>;
}

const NUMERIC_HEALTH = ['sleep_hours', 'sleep_quality', 'energy', 'mood', 'pain'];
const HEALTH_LABELS: Record<string, string> = {
  sleep_hours: 'Sleep hours',
  sleep_quality: 'Sleep quality',
  energy: 'Energy',
  mood: 'Mood',
  pain: 'Pain',
  sleep_notes: 'Sleep duration notes',
  sleep_quality_notes: 'Sleep quality notes',
  energy_notes: 'Energy notes',
  mood_notes: 'Mood notes',
  pain_notes: 'Pain notes',
  treatment_notes: 'Meds / treatments',
  general_notes: 'General notes',
};

function normalizeHealth(row: HealthChanges | null): HealthChanges | null {
  if (!row) return null;
  const out: HealthChanges = {};
  for (const key of [...NUMERIC_HEALTH, 'sleep_notes', 'sleep_quality_notes', 'energy_notes', 'mood_notes', 'pain_notes', 'treatment_notes', 'general_notes']) {
    out[key] = row[key] ?? (NUMERIC_HEALTH.includes(key) ? null : '');
  }
  return out;
}

export default function AIQuickAddModal({ date, layout, exerciseMap, log, notes, onClose, onApply }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [currentHealth, setCurrentHealth] = useState<HealthChanges | null>(null);

  const visibleExercises = useMemo(() => layout.flatMap(cat =>
    cat.exerciseIds
      .map(id => exerciseMap[id])
      .filter(Boolean)
      .map(ex => ({
        id: ex.id,
        name: ex.name,
        category: cat.name,
        sets: ex.sets ?? ex.cue ?? '',
        done: !!log[date]?.[ex.id],
        note: notes[ex.id] ?? '',
      }))
  ), [layout, exerciseMap, log, notes, date]);

  const loadHealth = async () => {
    const res = await fetch(`/api/health?date=${date}`);
    const data = await res.json();
    const row = data.row ? normalizeHealth(data.row) : null;
    setCurrentHealth(row);
    return row;
  };

  const analyze = async () => {
    if (!input.trim()) return;
    setError('');
    setLoading(true);
    try {
      const health = await loadHealth();
      const res = await fetch('/api/ai-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, exercises: visibleExercises, health: health ?? {} }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI failed');
      setProposal({
        summary: data.summary ?? [],
        exerciseChanges: data.exerciseChanges ?? [],
        healthChanges: data.healthChanges ?? {},
        questions: data.questions ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI failed');
    } finally {
      setLoading(false);
    }
  };

  const updateExercise = (idx: number, patch: Partial<ExerciseChange>) => {
    if (!proposal) return;
    const next = [...proposal.exerciseChanges];
    next[idx] = { ...next[idx], ...patch };
    setProposal({ ...proposal, exerciseChanges: next });
  };

  const removeExercise = (idx: number) => {
    if (!proposal) return;
    setProposal({ ...proposal, exerciseChanges: proposal.exerciseChanges.filter((_, i) => i !== idx) });
  };

  const updateHealth = (key: string, value: string) => {
    if (!proposal) return;
    const parsed = NUMERIC_HEALTH.includes(key) ? (value === '' ? null : Number(value)) : value;
    setProposal({ ...proposal, healthChanges: { ...proposal.healthChanges, [key]: parsed } });
  };

  const apply = async () => {
    if (!proposal) return;
    setSaving(true);
    try {
      const hasHealth = Object.keys(proposal.healthChanges || {}).length > 0;
      const nextHealth = hasHealth ? { ...(currentHealth ?? {}), ...proposal.healthChanges } : null;
      await onApply(proposal, currentHealth, nextHealth);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()} style={{ maxHeight: '92dvh' }}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">AI add</h2>
            <p className="text-[11px] text-stone-400">Describe what happened. Review before saving.</p>
          </div>
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 p-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Example: Did calf stretch 2 x 60 seconds both legs straight and bent. RDLs 3 x 8 each leg. Pain 3, energy 6, felt better overall."
              rows={5}
              className="w-full text-sm resize-none rounded-xl border border-stone-200 px-3 py-2.5 focus:outline-none bg-white"
              style={{ fontSize: 16, colorScheme: 'light' }}
            />
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); analyze(); }} disabled={loading || !input.trim()} className="mt-2 w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#7E9B86' }}>
              {loading ? 'Reading…' : 'Review changes'}
            </button>
            {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          </div>

          {proposal && (
            <>
              {!!proposal.questions?.length && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                  <p className="text-xs font-bold text-amber-800 mb-1">AI was unsure</p>
                  <ul className="space-y-1">{proposal.questions.map((q, i) => <li key={i} className="text-xs text-amber-700">• {q}</li>)}</ul>
                </div>
              )}

              {!!proposal.summary?.length && (
                <div className="bg-white rounded-2xl border border-stone-100 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Summary</p>
                  <ul className="space-y-1">{proposal.summary.map((item, i) => <li key={i} className="text-xs text-stone-600">• {item}</li>)}</ul>
                </div>
              )}

              {!!proposal.exerciseChanges.length && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Exercise changes</p>
                  {proposal.exerciseChanges.map((change, idx) => {
                    const ex = exerciseMap[change.id];
                    const oldNote = notes[change.id] ?? '';
                    const noteChanged = change.note != null && change.note !== oldNote;
                    return (
                      <div key={`${change.id}-${idx}`} className="bg-white rounded-2xl border border-stone-100 p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="text-sm font-bold text-stone-800">{ex?.name ?? change.id}</p>
                            {change.reason && <p className="text-[11px] text-stone-400">{change.reason}</p>}
                          </div>
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); removeExercise(idx); }} className="text-xs text-stone-400">Remove</button>
                        </div>
                        <div className="flex gap-2 mb-2">
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); updateExercise(idx, { completed: true }); }} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: change.completed === true ? '#E4ECE6' : '#f5f5f4', color: change.completed === true ? '#476653' : '#78716c' }}>Done</button>
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); updateExercise(idx, { completed: false }); }} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: change.completed === false ? '#fee2e2' : '#f5f5f4', color: change.completed === false ? '#991b1b' : '#78716c' }}>Not done</button>
                        </div>
                        {noteChanged && oldNote && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-2">Replacing note: {oldNote}</p>}
                        <textarea value={change.note ?? ''} onChange={e => updateExercise(idx, { note: e.target.value })} placeholder="Optional note…" rows={2} className="w-full text-sm resize-none rounded-xl border border-stone-200 px-3 py-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {!!Object.keys(proposal.healthChanges || {}).length && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Health / general notes</p>
                  {Object.entries(proposal.healthChanges).map(([key, value]) => {
                    const oldValue = currentHealth?.[key] ?? '';
                    const changed = String(oldValue ?? '') !== String(value ?? '');
                    return (
                      <div key={key} className="bg-white rounded-xl border border-stone-100 p-3">
                        <label className="block text-xs font-bold text-stone-700 mb-1">{HEALTH_LABELS[key] ?? key}</label>
                        {changed && oldValue !== '' && oldValue != null && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-2">Replacing: {String(oldValue)}</p>}
                        {NUMERIC_HEALTH.includes(key) ? (
                          <input type="number" value={value == null ? '' : String(value)} onChange={e => updateHealth(key, e.target.value)} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" style={{ fontSize: 16, colorScheme: 'light' }} />
                        ) : (
                          <textarea value={value == null ? '' : String(value)} onChange={e => updateHealth(key, e.target.value)} rows={2} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm resize-none" style={{ fontSize: 16, colorScheme: 'light' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={e => { e.preventDefault(); e.stopPropagation(); apply(); }} disabled={saving} className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#5B9BD5' }}>
                {saving ? 'Saving…' : 'Save these changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
