'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';
import { SmartExerciseChange, SmartHealthChanges, SmartNewExercise, SmartProposal } from '@/components/SmartAddTypes';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;

interface Props {
  date: string;
  layout: CategoryConfig[];
  exerciseMap: Record<string, Exercise>;
  log: LogMap;
  notes: NotesMap;
  onClose: () => void;
  onApply: (proposal: SmartProposal, previousHealth: SmartHealthChanges | null, nextHealth: SmartHealthChanges | null) => Promise<void>;
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

function normalizeHealth(row: SmartHealthChanges | null): SmartHealthChanges | null {
  if (!row) return null;
  const out: SmartHealthChanges = {};
  for (const key of [...NUMERIC_HEALTH, 'sleep_notes', 'sleep_quality_notes', 'energy_notes', 'mood_notes', 'pain_notes', 'treatment_notes', 'general_notes']) {
    out[key] = row[key] ?? (NUMERIC_HEALTH.includes(key) ? null : '');
  }
  return out;
}

function sameNote(a: unknown, b: unknown) {
  return String(a ?? '').trim() === String(b ?? '').trim();
}

function sameHealthValue(key: string, oldValue: unknown, newValue: unknown) {
  if (NUMERIC_HEALTH.includes(key)) {
    const oldBlank = oldValue === null || oldValue === undefined || oldValue === '';
    const newBlank = newValue === null || newValue === undefined || newValue === '';
    if (oldBlank && newBlank) return true;
    return Number(oldValue) === Number(newValue);
  }
  return sameNote(oldValue, newValue);
}

export default function AIQuickAddModal({ date, layout, exerciseMap, log, notes, onClose, onApply }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<SmartProposal | null>(null);
  const [currentHealth, setCurrentHealth] = useState<SmartHealthChanges | null>(null);

  const categoryNames = useMemo(() => layout.map(cat => cat.name), [layout]);

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

  const compactProposal = (raw: any, health: SmartHealthChanges | null): SmartProposal => {
    const exerciseChanges: SmartExerciseChange[] = (raw.exerciseChanges ?? [])
      .map((change: SmartExerciseChange) => {
        const currentDone = !!log[date]?.[change.id];
        const currentNote = notes[change.id] ?? '';
        const next: SmartExerciseChange = { id: change.id, reason: change.reason };
        if (typeof change.completed === 'boolean' && change.completed !== currentDone) next.completed = change.completed;
        if (change.note !== undefined && change.note !== null && !sameNote(change.note, currentNote)) next.note = String(change.note).trim();
        return next;
      })
      .filter((change: SmartExerciseChange) => typeof change.completed === 'boolean' || change.note !== undefined);

    const healthChanges: SmartHealthChanges = {};
    Object.entries(raw.healthChanges ?? {}).forEach(([key, value]) => {
      if (!sameHealthValue(key, health?.[key], value)) healthChanges[key] = value as string | number | null;
    });

    const newExercises: SmartNewExercise[] = (raw.newExercises ?? [])
      .map((item: SmartNewExercise) => ({
        name: String(item.name ?? '').trim(),
        categoryName: categoryNames.includes(item.categoryName ?? '') ? item.categoryName : categoryNames[0],
        sets: String(item.sets ?? '').trim(),
        cue: String(item.cue ?? '').trim(),
        note: String(item.note ?? '').trim(),
        completed: typeof item.completed === 'boolean' ? item.completed : true,
        reason: String(item.reason ?? '').trim(),
      }))
      .filter((item: SmartNewExercise) => item.name);

    return {
      summary: raw.summary ?? [],
      exerciseChanges,
      newExercises,
      healthChanges,
      questions: raw.questions ?? [],
    };
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
      setProposal(compactProposal(data, health));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI failed');
    } finally {
      setLoading(false);
    }
  };

  const updateExercise = (idx: number, patch: Partial<SmartExerciseChange>) => {
    if (!proposal) return;
    const next = [...proposal.exerciseChanges];
    next[idx] = { ...next[idx], ...patch };
    setProposal({ ...proposal, exerciseChanges: next });
  };

  const removeExercise = (idx: number) => {
    if (!proposal) return;
    setProposal({ ...proposal, exerciseChanges: proposal.exerciseChanges.filter((_, i) => i !== idx) });
  };

  const updateNewExercise = (idx: number, patch: Partial<SmartNewExercise>) => {
    if (!proposal) return;
    const next = [...proposal.newExercises];
    next[idx] = { ...next[idx], ...patch };
    setProposal({ ...proposal, newExercises: next });
  };

  const removeNewExercise = (idx: number) => {
    if (!proposal) return;
    setProposal({ ...proposal, newExercises: proposal.newExercises.filter((_, i) => i !== idx) });
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

  const hasChanges = !!proposal && (proposal.exerciseChanges.length > 0 || proposal.newExercises.length > 0 || Object.keys(proposal.healthChanges || {}).length > 0);

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

              {!hasChanges && (
                <div className="bg-white rounded-2xl border border-stone-100 p-3 text-center">
                  <p className="text-sm font-bold text-stone-700">No new changes found</p>
                  <p className="text-xs text-stone-400 mt-1">Already-completed fields and unchanged notes are hidden.</p>
                </div>
              )}

              {!!proposal.newExercises.length && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">New exercises</p>
                  {proposal.newExercises.map((item, idx) => (
                    <div key={`${item.name}-${idx}`} className="bg-white rounded-2xl border-2 p-3" style={{ borderColor: '#cfded3' }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mb-1" style={{ background: '#E4ECE6', color: '#476653' }}>AI added</span>
                          <input value={item.name} onChange={e => updateNewExercise(idx, { name: e.target.value })} className="block w-full text-sm font-bold text-stone-800 bg-transparent border-b border-stone-200 focus:outline-none" style={{ fontSize: 16 }} />
                        </div>
                        <button onClick={e => { e.preventDefault(); e.stopPropagation(); removeNewExercise(idx); }} className="text-xs text-stone-400">Remove</button>
                      </div>
                      <select value={item.categoryName ?? categoryNames[0] ?? ''} onChange={e => updateNewExercise(idx, { categoryName: e.target.value })} className="mb-2 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm bg-white" style={{ fontSize: 16 }}>
                        {categoryNames.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                      <input value={item.sets ?? ''} onChange={e => updateNewExercise(idx, { sets: e.target.value })} placeholder="Sets/reps/time" className="mb-2 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm" style={{ fontSize: 16 }} />
                      <textarea value={item.cue ?? ''} onChange={e => updateNewExercise(idx, { cue: e.target.value })} placeholder="Cue / instructions" rows={2} className="mb-2 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm resize-none" style={{ fontSize: 16 }} />
                      <textarea value={item.note ?? ''} onChange={e => updateNewExercise(idx, { note: e.target.value })} placeholder="Optional note for today" rows={2} className="w-full rounded-lg border border-stone-200 px-2 py-2 text-sm resize-none" style={{ fontSize: 16 }} />
                    </div>
                  ))}
                </div>
              )}

              {!!proposal.exerciseChanges.length && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Exercise updates</p>
                  {proposal.exerciseChanges.map((change, idx) => {
                    const ex = exerciseMap[change.id];
                    const oldNote = notes[change.id] ?? '';
                    const noteChanged = change.note != null && change.note !== oldNote;
                    return (
                      <div key={`${change.id}-${idx}`} className="bg-white rounded-2xl border border-stone-100 p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mb-1" style={{ background: '#FBF5E8', color: '#B8883A' }}>Update</span>
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Health / general updates</p>
                  {Object.entries(proposal.healthChanges).map(([key, value]) => {
                    const oldValue = currentHealth?.[key] ?? '';
                    const changed = String(oldValue ?? '') !== String(value ?? '');
                    return (
                      <div key={key} className="bg-white rounded-xl border border-stone-100 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-stone-700">{HEALTH_LABELS[key] ?? key}</label>
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: oldValue !== '' && oldValue != null ? '#FBF5E8' : '#E4ECE6', color: oldValue !== '' && oldValue != null ? '#B8883A' : '#476653' }}>{oldValue !== '' && oldValue != null ? 'Update' : 'Add'}</span>
                        </div>
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

              <button onClick={e => { e.preventDefault(); e.stopPropagation(); apply(); }} disabled={saving || !hasChanges} className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#5B9BD5' }}>
                {saving ? 'Saving…' : 'Save these changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
