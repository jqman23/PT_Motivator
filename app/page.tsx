'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { EXERCISES, Exercise } from '@/lib/exercises';
import ExerciseCard from '@/components/ExerciseCard';
import WeekTracker from '@/components/WeekTracker';
import HealthTracker from '@/components/HealthTracker';
import CalendarModal from '@/components/CalendarModal';
import TimerWidget from '@/components/TimerWidget';

// ─── Types ───────────────────────────────────────────────────────────────────

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;

export interface CategoryConfig {
  id: string;
  name: string;
  color: string; // 'green' | 'orange' | 'blue' | 'purple'
  exerciseIds: string[];
}

type DragState =
  | { kind: 'ex'; id: string; fromCat: string }
  | { kind: 'cat'; id: string }
  | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const EXERCISE_MAP = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

const COLOR_PALETTE: Record<string, { accent: string; light: string }> = {
  green:  { accent: '#7E9B86', light: '#E4ECE6' },
  orange: { accent: '#C17B4F', light: '#F4E3D6' },
  blue:   { accent: '#5B9BD5', light: '#dbeafe' },
  purple: { accent: '#7C3AED', light: '#ede9fe' },
};
const COLOR_KEYS = ['green', 'orange', 'blue', 'purple'] as const;

const QUOTES = [
  "Recovery is not linear. Every rep, every day counts.",
  "The comeback is always stronger than the setback.",
  "Small steps every day lead to big changes.",
  "Consistency beats intensity every single time.",
  "Trust the process. Your body knows how to heal.",
  "Every workout is a deposit into your health account.",
  "Rest when you must. Move when you can.",
  "Healing takes courage — and you have it.",
  "Progress, not perfection.",
  "Your only competition is who you were yesterday.",
  "One day at a time. One rep at a time.",
  "The pain you feel today is the strength you'll feel tomorrow.",
  "Be patient with yourself. You're getting better every day.",
  "Motion is the lotion. Keep moving.",
  "Your body hears everything your mind says. Stay positive.",
  "The hardest step is the first one. You've already taken it.",
  "Celebrate every small win. They add up.",
  "You've come too far to only come this far.",
  "Focus on what your body CAN do, not what it can't.",
  "Rehabilitation is a marathon, not a sprint.",
];

function getDailyQuote() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  return QUOTES[Math.floor((Date.now() - start.getTime()) / 86400000) % QUOTES.length];
}

function makeDefaultLayout(): CategoryConfig[] {
  return [
    {
      id: 'daily-mobility',
      name: 'Daily mobility & balance',
      color: 'green',
      exerciseIds: EXERCISES.filter(e => e.cat === 'mobility').map(e => e.id),
    },
    {
      id: 'strength-day',
      name: 'Strength day',
      color: 'orange',
      exerciseIds: EXERCISES.filter(e => e.cat === 'strength').map(e => e.id),
    },
  ];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateStr(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayStr() { return dateStr(new Date()); }
function offsetDate(base: string, days: number) {
  const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + days); return dateStr(d);
}
function displayForDate(ds: string) {
  const today = todayStr(); const yesterday = offsetDate(today, -1);
  if (ds === today) return 'Today';
  if (ds === yesterday) return 'Yesterday';
  return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const today = todayStr();

  // ── Workout state
  const [selectedDate, setSelectedDate] = useState(today);
  const [log, setLog] = useState<LogMap>({});
  const [notes, setNotes] = useState<NotesMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllDone, setSaveAllDone] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [confirmClearDay, setConfirmClearDay] = useState(false);
  const [clearing, setClearing] = useState(false);

  // ── Layout / category state
  const [layout, setLayout] = useState<CategoryConfig[]>([]);
  const [layoutLoading, setLayoutLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Inline editing (no edit mode — always available)
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [colorMenuCat, setColorMenuCat] = useState<string | null>(null);
  const [addingExToCat, setAddingExToCat] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('blue');

  // Drag & drop
  const [drag, setDrag] = useState<DragState>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // exId or catId currently hovered

  const weekStart = offsetDate(today, -6);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Restore date from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('pt-selected-date');
    if (stored && stored <= todayStr()) setSelectedDate(stored);
  }, []);

  // ── Load layout from DB
  useEffect(() => {
    fetch('/api/config?key=layout')
      .then(r => r.json())
      .then(data => {
        if (data.value && Array.isArray(data.value) && data.value.length > 0) {
          setLayout(data.value as CategoryConfig[]);
        } else {
          const def = makeDefaultLayout();
          setLayout(def);
          fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'layout', value: def }),
          }).catch(console.error);
        }
      })
      .catch(() => setLayout(makeDefaultLayout()))
      .finally(() => setLayoutLoading(false));
  }, []);

  // ── Load workout log + notes
  const loadLog = useCallback(async (selected: string) => {
    const rangeStart = selected < weekStart ? selected : weekStart;
    try {
      const res = await fetch(`/api/log?start=${rangeStart}&end=${today}`);
      if (res.ok) {
        const { rows } = await res.json();
        const newLog: LogMap = {};
        for (const row of rows) {
          const dk = (row.date as string).split('T')[0];
          if (!newLog[dk]) newLog[dk] = {};
          newLog[dk][row.exercise_id] = row.completed;
        }
        setLog(newLog);
      }
    } catch (err) { console.error(err); }
  }, [today, weekStart]);

  const loadNotes = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/notes?date=${date}`);
      if (res.ok) {
        const { rows } = await res.json();
        const newNotes: NotesMap = {};
        for (const row of rows) newNotes[row.exercise_id] = row.note;
        setNotes(newNotes);
      }
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLog(selectedDate), loadNotes(selectedDate)]).finally(() => setLoading(false));
  }, [loadLog, loadNotes, selectedDate]);

  // ── Layout save helper
  const updateLayout = useCallback((next: CategoryConfig[]) => {
    setLayout(next);
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'layout', value: next }),
    }).catch(console.error);
  }, []);

  // ── Date navigation
  const changeDate = (date: string) => {
    setSelectedDate(date);
    localStorage.setItem('pt-selected-date', date);
    setNotes({});
    setConfirmClearDay(false);
  };
  const handleDateChange = (dir: -1 | 1) => {
    const next = offsetDate(selectedDate, dir);
    if (next > today) return;
    changeDate(next);
  };

  // ── Save all
  const handleSaveAll = async () => {
    setSavingAll(true);
    setSaveAllDone(false);
    try {
      const dayLog = log[selectedDate] || {};
      await fetch('/api/save-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          log: EXERCISES.map(ex => ({ exerciseId: ex.id, completed: dayLog[ex.id] ?? false })),
          notes: Object.entries(notes).map(([exerciseId, note]) => ({ exerciseId, note })),
        }),
      });
      setSaveAllDone(true);
      setTimeout(() => setSaveAllDone(false), 3000);
    } catch (err) { console.error(err); }
    finally { setSavingAll(false); }
  };

  const handleToggle = async (exerciseId: string) => {
    const current = log[selectedDate]?.[exerciseId] ?? false;
    const next = !current;
    setLog(prev => ({ ...prev, [selectedDate]: { ...(prev[selectedDate] || {}), [exerciseId]: next } }));
    setSaving(true);
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, exerciseId, completed: next }),
      });
    } catch {
      setLog(prev => ({ ...prev, [selectedDate]: { ...(prev[selectedDate] || {}), [exerciseId]: current } }));
    } finally { setSaving(false); }
  };

  const handleNoteSave = async (exerciseId: string, note: string) => {
    setNotes(prev => ({ ...prev, [exerciseId]: note }));
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, exerciseId, note }),
      });
    } catch (err) { console.error(err); }
  };

  const handleClearDay = async () => {
    setClearing(true); setConfirmClearDay(false);
    try {
      await Promise.all([
        fetch(`/api/log?date=${selectedDate}`, { method: 'DELETE' }),
        fetch(`/api/notes?date=${selectedDate}`, { method: 'DELETE' }),
        fetch(`/api/health?date=${selectedDate}`, { method: 'DELETE' }),
      ]);
      setLog(prev => ({ ...prev, [selectedDate]: {} }));
      setNotes({});
    } catch (err) { console.error(err); }
    finally { setClearing(false); }
  };

  // ── Category management
  const renameCat = (catId: string, name: string) => {
    updateLayout(layout.map(c => c.id === catId ? { ...c, name } : c));
    setRenamingCat(null);
  };
  const changeColor = (catId: string, color: string) => {
    updateLayout(layout.map(c => c.id === catId ? { ...c, color } : c));
    setColorMenuCat(null);
  };
  const deleteCat = (catId: string) => {
    updateLayout(layout.filter(c => c.id !== catId));
  };
  const addNewCategory = () => {
    if (!newCatName.trim()) return;
    updateLayout([...layout, {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      color: newCatColor,
      exerciseIds: [],
    }]);
    setNewCatName('');
    setAddingCategory(false);
  };

  // Arrow reorder (mobile-friendly)
  const moveCat = (catId: string, dir: -1 | 1) => {
    const idx = layout.findIndex(c => c.id === catId);
    const target = idx + dir;
    if (target < 0 || target >= layout.length) return;
    const next = [...layout];
    [next[idx], next[target]] = [next[target], next[idx]];
    updateLayout(next);
  };
  const moveEx = (catId: string, exId: string, dir: -1 | 1) => {
    updateLayout(layout.map(c => {
      if (c.id !== catId) return c;
      const ids = [...c.exerciseIds];
      const i = ids.indexOf(exId);
      const t = i + dir;
      if (t < 0 || t >= ids.length) return c;
      [ids[i], ids[t]] = [ids[t], ids[i]];
      return { ...c, exerciseIds: ids };
    }));
  };

  const addExToCategory = (exId: string, catId: string) => {
    // remove from any category, then append to target
    const next = layout.map(c => ({ ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) }))
      .map(c => c.id === catId ? { ...c, exerciseIds: [...c.exerciseIds, exId] } : c);
    updateLayout(next);
    setAddingExToCat(null);
  };

  // ── Drag & drop
  const dropExerciseBefore = (targetCatId: string, targetExId: string | null) => {
    if (!drag || drag.kind !== 'ex') return;
    const exId = drag.id;
    let next = layout.map(c => ({ ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) }));
    next = next.map(c => {
      if (c.id !== targetCatId) return c;
      const ids = [...c.exerciseIds];
      const idx = targetExId ? ids.indexOf(targetExId) : ids.length;
      ids.splice(idx < 0 ? ids.length : idx, 0, exId);
      return { ...c, exerciseIds: ids };
    });
    updateLayout(next);
    setDrag(null);
    setDragOver(null);
  };

  const dropCategoryBefore = (targetCatId: string) => {
    if (!drag || drag.kind !== 'cat' || drag.id === targetCatId) { setDrag(null); setDragOver(null); return; }
    const moved = layout.find(c => c.id === drag.id);
    if (!moved) return;
    const without = layout.filter(c => c.id !== drag.id);
    const idx = without.findIndex(c => c.id === targetCatId);
    without.splice(idx, 0, moved);
    updateLayout(without);
    setDrag(null);
    setDragOver(null);
  };

  useEffect(() => {
    if (renamingCat && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingCat]);

  // ── Derived
  const dayLog = log[selectedDate] || {};
  const isToday = selectedDate === today;
  const allAssignedExIds = new Set(layout.flatMap(c => c.exerciseIds));
  const unassignedExercises = EXERCISES.filter(e => !allAssignedExIds.has(e.id));

  const GripIcon = () => (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <circle cx="5.5" cy="3.5" r="1.3"/><circle cx="10.5" cy="3.5" r="1.3"/>
      <circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/>
      <circle cx="5.5" cy="12.5" r="1.3"/><circle cx="10.5" cy="12.5" r="1.3"/>
    </svg>
  );

  return (
    <main className="min-h-screen bg-[#F6F1E7] py-8 px-4" style={{ colorScheme: 'light' }}>
      <div className="max-w-xl mx-auto">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-3xl font-semibold text-stone-800">Ankle PT</h1>
            <div className="flex items-center gap-2">
              <TimerWidget />
              <button
                onPointerDown={() => setShowCalendar(true)}
                className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-500 shadow-sm"
                style={{ touchAction: 'manipulation' }}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <rect x="2" y="3" width="16" height="16" rx="2"/><path d="M2 8h16"/>
                  <path d="M6 1v4M14 1v4"/>
                  <rect x="5.5" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                  <rect x="9" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                  <rect x="12.5" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Date navigator */}
          <div className="flex items-center gap-3 mt-3">
            <button onClick={() => handleDateChange(-1)}
              className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 text-lg"
              style={{ touchAction: 'manipulation' }}>‹</button>
            <div className="flex-1 text-center">
              <span className="text-sm font-semibold text-stone-700">{displayForDate(selectedDate)}</span>
              {!isToday && <span className="text-xs text-stone-400 ml-2">{selectedDate}</span>}
            </div>
            <button onClick={() => handleDateChange(1)} disabled={isToday}
              className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 disabled:opacity-30 text-lg"
              style={{ touchAction: 'manipulation' }}>›</button>
          </div>

          {saving && <p className="text-xs mt-1 text-center animate-pulse" style={{ color: '#7E9B86' }}>Saving…</p>}

          {/* Today + Save day */}
          <div className="mt-2 flex items-center justify-center gap-2">
            {!isToday && (
              <button onPointerDown={() => changeDate(today)}
                className="text-xs font-semibold px-3 py-1 rounded-full"
                style={{ color: '#7E9B86', background: '#E4ECE6', touchAction: 'manipulation' }}>
                ↩ Today
              </button>
            )}
            <button onPointerDown={handleSaveAll} disabled={savingAll}
              className="text-xs font-semibold px-3 py-1 rounded-full transition-colors"
              style={{
                color: saveAllDone ? '#fff' : '#5B9BD5',
                background: saveAllDone ? '#5B9BD5' : '#dbeafe',
                touchAction: 'manipulation',
              }}>
              {savingAll ? 'Saving…' : saveAllDone ? '✓ Saved' : '↑ Save day'}
            </button>
          </div>

          {/* Clear day */}
          <div className="mt-2 flex justify-center">
            {!confirmClearDay ? (
              <button onPointerDown={() => setConfirmClearDay(true)}
                className="text-xs font-medium px-3 py-1 rounded-lg"
                style={{ color: '#a8a29e', touchAction: 'manipulation' }}>
                {clearing ? 'Clearing…' : 'Clear day'}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <span className="text-xs font-semibold" style={{ color: '#991b1b' }}>Clear ALL data for {displayForDate(selectedDate)}?</span>
                <button onPointerDown={handleClearDay}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg text-white"
                  style={{ background: '#ef4444', touchAction: 'manipulation' }}>Yes, clear</button>
                <button onPointerDown={() => setConfirmClearDay(false)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                  style={{ color: '#78716c', background: '#f5f5f4', touchAction: 'manipulation' }}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {showCalendar && (
          <CalendarModal today={today} selectedDate={selectedDate}
            onSelectDate={d => changeDate(d)} onClose={() => setShowCalendar(false)} />
        )}

        {/* ── Exercise sections ──────────────────────────────────────────── */}
        {loading || layoutLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-[#7E9B86] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {layout.map((cat, catIdx) => {
              const palette = COLOR_PALETTE[cat.color] ?? COLOR_PALETTE.green;
              const isCollapsed = !!collapsed[cat.id];
              const catExercises: Exercise[] = cat.exerciseIds.map(id => EXERCISE_MAP[id]).filter(Boolean);
              const done = catExercises.filter(e => dayLog[e.id]).length;
              const total = catExercises.length;
              const isRenaming = renamingCat === cat.id;

              const availableToAdd = EXERCISES.filter(e => !cat.exerciseIds.includes(e.id));
              const isCatDropTarget = drag?.kind === 'cat' && dragOver === cat.id && drag.id !== cat.id;

              return (
                <section
                  key={cat.id}
                  className="mb-5"
                  // Category-level drop zone (reordering categories)
                  onDragOver={(e) => {
                    if (drag?.kind === 'cat') { e.preventDefault(); setDragOver(cat.id); }
                  }}
                  onDrop={(e) => {
                    if (drag?.kind === 'cat') { e.preventDefault(); dropCategoryBefore(cat.id); }
                  }}
                  style={{
                    borderTop: isCatDropTarget ? `3px solid ${palette.accent}` : '3px solid transparent',
                    paddingTop: 2,
                    transition: 'border-color 0.1s',
                  }}
                >
                  {/* ── Category header */}
                  <div className="flex items-center gap-1.5 mb-2.5">
                    {/* Drag handle (desktop) */}
                    <span
                      draggable
                      onDragStart={() => setDrag({ kind: 'cat', id: cat.id })}
                      onDragEnd={() => { setDrag(null); setDragOver(null); }}
                      className="flex-shrink-0 w-5 h-7 flex items-center justify-center text-stone-300 hover:text-stone-500 cursor-grab active:cursor-grabbing"
                      title="Drag to reorder"
                    >
                      <GripIcon />
                    </span>

                    {/* Up/down (mobile) */}
                    <div className="flex flex-col flex-shrink-0">
                      <button onPointerDown={() => moveCat(cat.id, -1)} disabled={catIdx === 0}
                        className="w-5 h-3.5 flex items-center justify-center text-stone-300 hover:text-stone-500 disabled:opacity-0 text-[10px] leading-none"
                        style={{ touchAction: 'manipulation' }}>▲</button>
                      <button onPointerDown={() => moveCat(cat.id, 1)} disabled={catIdx === layout.length - 1}
                        className="w-5 h-3.5 flex items-center justify-center text-stone-300 hover:text-stone-500 disabled:opacity-0 text-[10px] leading-none"
                        style={{ touchAction: 'manipulation' }}>▼</button>
                    </div>

                    {/* Collapse toggle */}
                    <button
                      onPointerDown={() => setCollapsed(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-stone-400 rounded hover:bg-stone-100"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 transition-transform"
                        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                        <path d="M1 3l5 5 5-5z"/>
                      </svg>
                    </button>

                    {/* Name (tap to rename) */}
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => renameCat(cat.id, renameValue.trim() || cat.name)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameCat(cat.id, renameValue.trim() || cat.name);
                          if (e.key === 'Escape') setRenamingCat(null);
                        }}
                        className="flex-1 min-w-0 text-lg font-semibold text-stone-800 bg-stone-50 border border-stone-300 rounded-lg px-2 py-0.5 focus:outline-none"
                        style={{ fontSize: 16, fontFamily: 'Georgia, serif' }}
                      />
                    ) : (
                      <h2
                        className="flex-1 min-w-0 font-serif text-lg font-semibold text-stone-800 leading-tight truncate cursor-text"
                        onPointerDown={() => { setRenamingCat(cat.id); setRenameValue(cat.name); }}
                        title="Tap to rename"
                      >
                        {cat.name}
                      </h2>
                    )}

                    {/* Count */}
                    <span className="text-xs text-stone-400 flex-shrink-0">{done}/{total}</span>

                    {/* Color swatch / menu */}
                    <div className="relative flex-shrink-0">
                      <button
                        onPointerDown={() => setColorMenuCat(colorMenuCat === cat.id ? null : cat.id)}
                        className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                        style={{ background: palette.accent, touchAction: 'manipulation' }}
                        title="Change color"
                      />
                      {colorMenuCat === cat.id && (
                        <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg border border-stone-100 p-2 flex gap-2">
                          {COLOR_KEYS.map(c => (
                            <button key={c} onPointerDown={() => changeColor(cat.id, c)}
                              className="w-6 h-6 rounded-full"
                              style={{
                                background: COLOR_PALETTE[c].accent,
                                boxShadow: cat.color === c ? `0 0 0 2px white, 0 0 0 3.5px ${COLOR_PALETTE[c].accent}` : 'none',
                                touchAction: 'manipulation',
                              }} />
                          ))}
                          {cat.exerciseIds.length === 0 && (
                            <button onPointerDown={() => deleteCat(cat.id)}
                              className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-sm"
                              style={{ touchAction: 'manipulation' }} title="Delete empty category">×</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Exercise list */}
                  {!isCollapsed && (
                    <div
                      className="space-y-2"
                      // Drop into this category (append) — handles empty cats and cross-category moves
                      onDragOver={(e) => { if (drag?.kind === 'ex') { e.preventDefault(); } }}
                      onDrop={(e) => {
                        if (drag?.kind === 'ex') {
                          e.preventDefault();
                          // Only append if not dropped on a specific row (rows stop propagation)
                          dropExerciseBefore(cat.id, null);
                        }
                      }}
                    >
                      {catExercises.map((ex, exIdx) => {
                        const isExDropTarget = drag?.kind === 'ex' && dragOver === ex.id && drag.id !== ex.id;
                        return (
                          <div
                            key={ex.id}
                            onDragOver={(e) => { if (drag?.kind === 'ex') { e.preventDefault(); setDragOver(ex.id); } }}
                            onDrop={(e) => {
                              if (drag?.kind === 'ex') { e.preventDefault(); e.stopPropagation(); dropExerciseBefore(cat.id, ex.id); }
                            }}
                            style={{
                              borderTop: isExDropTarget ? `3px solid ${palette.accent}` : '3px solid transparent',
                              borderRadius: 4,
                              opacity: drag?.kind === 'ex' && drag.id === ex.id ? 0.4 : 1,
                            }}
                          >
                            <div className="flex items-stretch gap-1.5">
                              {/* Drag rail */}
                              <div className="flex flex-col items-center justify-center flex-shrink-0 gap-0.5">
                                <button onPointerDown={() => moveEx(cat.id, ex.id, -1)} disabled={exIdx === 0}
                                  className="w-5 h-4 flex items-center justify-center text-stone-300 hover:text-stone-500 disabled:opacity-0 text-[10px] leading-none"
                                  style={{ touchAction: 'manipulation' }}>▲</button>
                                <span
                                  draggable
                                  onDragStart={() => setDrag({ kind: 'ex', id: ex.id, fromCat: cat.id })}
                                  onDragEnd={() => { setDrag(null); setDragOver(null); }}
                                  className="w-5 h-5 flex items-center justify-center text-stone-300 hover:text-stone-500 cursor-grab active:cursor-grabbing"
                                  title="Drag to move"
                                >
                                  <GripIcon />
                                </span>
                                <button onPointerDown={() => moveEx(cat.id, ex.id, 1)} disabled={exIdx === catExercises.length - 1}
                                  className="w-5 h-4 flex items-center justify-center text-stone-300 hover:text-stone-500 disabled:opacity-0 text-[10px] leading-none"
                                  style={{ touchAction: 'manipulation' }}>▼</button>
                              </div>

                              <div className="flex-1 min-w-0">
                                <ExerciseCard
                                  exercise={ex}
                                  done={dayLog[ex.id] ?? false}
                                  note={notes[ex.id] ?? ''}
                                  today={selectedDate}
                                  onToggle={() => handleToggle(ex.id)}
                                  onNoteSave={note => handleNoteSave(ex.id, note)}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add exercise */}
                      {addingExToCat === cat.id ? (
                        <div className="bg-white rounded-xl border border-stone-100 p-3 ml-6">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Add an exercise:</p>
                          {availableToAdd.length > 0 ? (
                            <div className="space-y-1 max-h-56 overflow-y-auto">
                              {availableToAdd.map(e => {
                                const inCat = layout.find(c => c.exerciseIds.includes(e.id));
                                return (
                                  <button key={e.id} onPointerDown={() => addExToCategory(e.id, cat.id)}
                                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-stone-50 text-stone-700 flex items-center gap-2"
                                    style={{ touchAction: 'manipulation' }}>
                                    <span className="font-medium">{e.name}</span>
                                    <span className="text-stone-400 text-[10px] ml-auto">{inCat ? `in ${inCat.name}` : 'unassigned'}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-stone-400 py-2">All exercises are already here.</p>
                          )}
                          <button onPointerDown={() => setAddingExToCat(null)}
                            className="mt-2 text-xs text-stone-400 font-medium" style={{ touchAction: 'manipulation' }}>Cancel</button>
                        </div>
                      ) : (
                        <button
                          onPointerDown={() => setAddingExToCat(cat.id)}
                          className="ml-6 text-xs font-semibold flex items-center gap-1 px-2 py-1.5 rounded-lg text-stone-400 hover:bg-stone-100"
                          style={{ touchAction: 'manipulation' }}
                        >
                          <span className="text-base leading-none">＋</span> Add exercise
                        </button>
                      )}
                    </div>
                  )}

                  {/* Collapsed summary */}
                  {isCollapsed && (
                    <button
                      onPointerDown={() => setCollapsed(prev => ({ ...prev, [cat.id]: false }))}
                      className="w-full py-2 rounded-xl text-xs font-semibold text-center border border-dashed"
                      style={{ borderColor: palette.accent + '40', color: palette.accent, background: palette.light + '60', touchAction: 'manipulation' }}
                    >
                      {done}/{total} done · tap to expand
                    </button>
                  )}
                </section>
              );
            })}

            {/* ── Add new category */}
            <div className="mb-5">
              {addingCategory ? (
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">New category</p>
                  <input
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addNewCategory()}
                    placeholder="Category name…"
                    autoFocus
                    className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-3 focus:outline-none"
                    style={{ fontSize: 16, colorScheme: 'light' }}
                  />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Color</p>
                  <div className="flex gap-3 mb-4">
                    {COLOR_KEYS.map(c => (
                      <button key={c} onPointerDown={() => setNewCatColor(c)}
                        className="w-8 h-8 rounded-full"
                        style={{
                          background: COLOR_PALETTE[c].accent,
                          transform: newCatColor === c ? 'scale(1.25)' : 'scale(1)',
                          boxShadow: newCatColor === c ? `0 0 0 2px white, 0 0 0 3.5px ${COLOR_PALETTE[c].accent}` : 'none',
                          touchAction: 'manipulation',
                        }} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onPointerDown={addNewCategory}
                      className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl"
                      style={{ background: COLOR_PALETTE[newCatColor].accent, touchAction: 'manipulation' }}>Add category</button>
                    <button onPointerDown={() => { setAddingCategory(false); setNewCatName(''); }}
                      className="px-4 py-2.5 text-sm text-stone-500 rounded-xl hover:bg-stone-100"
                      style={{ touchAction: 'manipulation' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onPointerDown={() => setAddingCategory(true)}
                  className="w-full py-3.5 rounded-2xl border-2 border-dashed border-stone-200 text-sm font-semibold text-stone-400 hover:border-stone-300 hover:text-stone-500"
                  style={{ touchAction: 'manipulation' }}
                >
                  ＋ Add category
                </button>
              )}
            </div>

            {/* Health tracker */}
            <section className="mb-5">
              <HealthTracker today={selectedDate} />
            </section>

            {/* Week tracker */}
            <section className="mb-5">
              <WeekTracker log={log} today={today} selectedDate={selectedDate} />
            </section>

            <p className="text-center text-xs pb-4 italic" style={{ color: '#a8a29e' }}>
              &ldquo;{getDailyQuote()}&rdquo;
            </p>
          </>
        )}
      </div>
    </main>
  );
}
