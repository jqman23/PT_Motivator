'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EXERCISES, Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';
import AIQuickAddModal from '@/components/AIQuickAddModal';
import { SmartHealthChanges, SmartProposal } from '@/components/SmartAddTypes';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;
type UndoPayload = { date: string; log: Record<string, boolean>; notes: Record<string, string>; health: SmartHealthChanges | null; hadHealthChange: boolean; newExerciseIds?: string[] };

function dateStr(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getSelectedDate() {
  return localStorage.getItem('pt-selected-date') || dateStr(new Date());
}

function defaultLayout(): CategoryConfig[] {
  return [
    { id: 'daily-mobility', name: 'Daily mobility & balance', color: 'green', exerciseIds: EXERCISES.filter(e => e.cat === 'mobility').map(e => e.id) },
    { id: 'strength-day', name: 'Strength day', color: 'orange', exerciseIds: EXERCISES.filter(e => e.cat === 'strength').map(e => e.id) },
  ];
}

function seedLibrary(custom: Exercise[] = []) {
  const byId = new Map<string, Exercise>();
  EXERCISES.forEach(ex => byId.set(ex.id, { ...ex, origin: ex.origin ?? 'hep' }));
  custom.forEach(ex => byId.set(ex.id, ex));
  return Array.from(byId.values());
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'exercise';
}

function catFor(categoryName?: string): Exercise['cat'] {
  return /strength|raise|squat|rdl|resistance/i.test(categoryName ?? '') ? 'strength' : 'mobility';
}

function pickKeys(source: SmartHealthChanges | null, keys: string[]) {
  if (!source) return null;
  return Object.fromEntries(keys.map(key => [key, source[key] ?? null]));
}

export default function SmartAddPortal() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [date, setDate] = useState('');
  const [layout, setLayout] = useState<CategoryConfig[]>([]);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [log, setLog] = useState<LogMap>({});
  const [notes, setNotes] = useState<NotesMap>({});
  const [showModal, setShowModal] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState(false);

  const exerciseMap = useMemo(() => Object.fromEntries(library.map(ex => [ex.id, ex])), [library]);

  useEffect(() => {
    const tick = () => {
      setDate(getSelectedDate());
      setCanUndo(!!localStorage.getItem('pt-smart-add-undo'));
    };
    tick();
    const id = window.setInterval(tick, 700);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const findSlot = () => {
      const rows = Array.from(document.querySelectorAll('main div.mt-2.flex.items-center.justify-center.gap-2')) as HTMLElement[];
      const row = rows[0];
      if (!row) return;
      let host = document.getElementById('pt-smart-add-slot');
      if (!host) {
        host = document.createElement('span');
        host.id = 'pt-smart-add-slot';
        host.style.display = 'inline-flex';
        host.style.gap = '0.35rem';
        host.style.alignItems = 'center';
        const saveButton = Array.from(row.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save'));
        row.insertBefore(host, saveButton?.nextSibling ?? row.firstChild);
      }
      setSlot(host);
    };
    findSlot();
    const id = window.setInterval(findSlot, 800);
    return () => window.clearInterval(id);
  }, []);

  const loadDay = async (targetDate = date || getSelectedDate()) => {
    if (!targetDate) return;
    setDate(targetDate);
    const [layoutRes, libraryRes, customRes, logRes, notesRes] = await Promise.all([
      fetch('/api/config?key=layout').then(r => r.json()).catch(() => ({ value: null })),
      fetch('/api/config?key=exerciseLibrary').then(r => r.json()).catch(() => ({ value: null })),
      fetch('/api/config?key=customExercises').then(r => r.json()).catch(() => ({ value: null })),
      fetch(`/api/log?start=${targetDate}&end=${targetDate}`).then(r => r.json()).catch(() => ({ rows: [] })),
      fetch(`/api/notes?date=${targetDate}`).then(r => r.json()).catch(() => ({ rows: [] })),
    ]);
    setLayout(Array.isArray(layoutRes.value) && layoutRes.value.length ? layoutRes.value : defaultLayout());
    setLibrary(Array.isArray(libraryRes.value) && libraryRes.value.length ? libraryRes.value : seedLibrary(Array.isArray(customRes.value) ? customRes.value : []));
    const dayLog: LogMap = { [targetDate]: {} };
    (logRes.rows ?? []).forEach((row: { exercise_id: string; completed: boolean }) => { dayLog[targetDate][row.exercise_id] = row.completed; });
    setLog(dayLog);
    const dayNotes: NotesMap = {};
    (notesRes.rows ?? []).forEach((row: { exercise_id: string; note: string }) => { dayNotes[row.exercise_id] = row.note; });
    setNotes(dayNotes);
  };

  const openSmartAdd = async () => {
    setBusy(true);
    try {
      const targetDate = getSelectedDate();
      await loadDay(targetDate);
      setShowModal(true);
    } finally { setBusy(false); }
  };

  const saveConfig = async (key: string, value: unknown) => {
    await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
  };

  const applyProposal = async (proposal: SmartProposal, previousHealth: SmartHealthChanges | null) => {
    const previousLog: Record<string, boolean> = {};
    const previousNotes: Record<string, string> = {};
    const newExerciseIds: string[] = [];
    const healthPatch = Object.keys(proposal.healthChanges || {}).length ? proposal.healthChanges : null;
    const previousHealthPatch = healthPatch ? pickKeys(previousHealth, Object.keys(healthPatch)) : null;

    for (const change of proposal.exerciseChanges || []) {
      if (typeof change.completed === 'boolean') previousLog[change.id] = log[date]?.[change.id] ?? false;
      if (change.note !== undefined && change.note !== null) previousNotes[change.id] = notes[change.id] ?? '';
    }

    if (proposal.newExercises?.length) {
      const additions: Exercise[] = proposal.newExercises.map((item, idx) => {
        const id = `ai-${Date.now()}-${idx}-${slug(item.name)}`;
        const aiTips = Array.isArray(item.tips) ? item.tips.map(tip => tip.trim()).filter(Boolean) : [];
        newExerciseIds.push(id);
        return {
          id,
          cat: catFor(item.categoryName),
          name: item.name.trim(),
          cue: item.cue?.trim() || item.sets?.trim() || 'AI added exercise — review with your PT.',
          sets: item.sets?.trim() || undefined,
          videoIds: [],
          videoTitles: [],
          imageSearch: item.name.trim(),
          tips: aiTips.length ? aiTips : ['AI added — review form and dosage with your PT.'],
          origin: 'patient_added',
          sourceId: 'ai-added',
        };
      });
      const nextLibrary = [...library, ...additions];
      const nextLayout = layout.map(cat => {
        const ids = additions.filter((_, idx) => (proposal.newExercises[idx].categoryName || layout[0]?.name) === cat.name).map(ex => ex.id);
        return ids.length ? { ...cat, exerciseIds: Array.from(new Set([...cat.exerciseIds, ...ids])) } : cat;
      });
      setLibrary(nextLibrary);
      setLayout(nextLayout);
      await Promise.all([saveConfig('exerciseLibrary', nextLibrary), saveConfig('layout', nextLayout)]);
      for (let i = 0; i < additions.length; i++) {
        const draft = proposal.newExercises[i];
        if (typeof draft.completed === 'boolean') await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, exerciseId: additions[i].id, completed: draft.completed }) });
        if (draft.note?.trim()) await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, exerciseId: additions[i].id, note: draft.note }) });
      }
    }

    for (const change of proposal.exerciseChanges || []) {
      if (typeof change.completed === 'boolean') await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, exerciseId: change.id, completed: change.completed }) });
      if (change.note !== undefined && change.note !== null) await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, exerciseId: change.id, note: change.note }) });
    }
    if (healthPatch) await fetch('/api/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, ...healthPatch }) });
    const undo: UndoPayload = { date, log: previousLog, notes: previousNotes, health: previousHealthPatch, hadHealthChange: !!healthPatch, newExerciseIds };
    localStorage.setItem('pt-smart-add-undo', JSON.stringify(undo));
    setCanUndo(true);
    window.setTimeout(() => window.location.reload(), 150);
  };

  const undoLast = async () => {
    const raw = localStorage.getItem('pt-smart-add-undo');
    if (!raw) return;
    setBusy(true);
    try {
      const undo = JSON.parse(raw) as UndoPayload;
      const idsToRemove = undo.newExerciseIds ?? [];
      if (idsToRemove.length) {
        const [layoutRes, libraryRes] = await Promise.all([
          fetch('/api/config?key=layout').then(r => r.json()).catch(() => ({ value: layout })),
          fetch('/api/config?key=exerciseLibrary').then(r => r.json()).catch(() => ({ value: library })),
        ]);
        const activeLayout: CategoryConfig[] = Array.isArray(layoutRes.value) ? layoutRes.value : layout;
        const activeLibrary: Exercise[] = Array.isArray(libraryRes.value) ? libraryRes.value : library;
        const nextLayout = activeLayout.map(cat => ({ ...cat, exerciseIds: cat.exerciseIds.filter(id => !idsToRemove.includes(id)) }));
        const nextLibrary = activeLibrary.filter(ex => !idsToRemove.includes(ex.id));
        await Promise.all([saveConfig('layout', nextLayout), saveConfig('exerciseLibrary', nextLibrary)]);
        for (const id of idsToRemove) {
          await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: undo.date, exerciseId: id, completed: false }) });
          await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: undo.date, exerciseId: id, note: '' }) });
        }
      }
      for (const [id, completed] of Object.entries(undo.log || {})) await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: undo.date, exerciseId: id, completed }) });
      for (const [id, note] of Object.entries(undo.notes || {})) await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: undo.date, exerciseId: id, note }) });
      if (undo.hadHealthChange) {
        if (undo.health) await fetch('/api/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: undo.date, ...undo.health }) });
        else await fetch(`/api/health?date=${undo.date}`, { method: 'DELETE' });
      }
      localStorage.removeItem('pt-smart-add-undo');
      setCanUndo(false);
      window.setTimeout(() => window.location.reload(), 150);
    } finally { setBusy(false); }
  };

  const controls = (
    <>
      <button onClick={openSmartAdd} disabled={busy} className="text-xs font-bold px-3 py-1 rounded-full text-white disabled:opacity-40" style={{ background: '#7E9B86', touchAction: 'manipulation' }}>Add</button>
      <button onClick={undoLast} disabled={!canUndo || busy} className="text-xs font-bold px-2.5 py-1 rounded-full disabled:opacity-30" style={{ color: '#78716c', background: '#f5f5f4', touchAction: 'manipulation' }} title="Undo last AI add">↶</button>
    </>
  );

  return (
    <>
      {slot ? createPortal(controls, slot) : null}
      {showModal && <AIQuickAddModal date={date} layout={layout} exerciseMap={exerciseMap} log={log} notes={notes} onApply={applyProposal} onClose={() => setShowModal(false)} />}
    </>
  );
}
