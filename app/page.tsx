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
  const [editMode, setEditMode] = useState(false);

  // Edit-mode sub-states
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [movingExercise, setMovingExercise] = useState<string | null>(null); // exerciseId
  const [addingExToCat, setAddingExToCat] = useState<string | null>(null); // catId
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('blue');

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
          // Persist default layout so future loads are fast
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
  const saveLayout = useCallback((next: CategoryConfig[]) => {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'layout', value: next }),
    }).catch(console.error);
  }, []);

  const updateLayout = useCallback((next: CategoryConfig[]) => {
    setLayout(next);
    saveLayout(next);
    setMovingExercise(null);
    setAddingExToCat(null);
  }, [saveLayout]);

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

  // ── Save all (workout_log + notes for this day)
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

  // ── Category management helpers
  const moveCatUp = (catId: string) => {
    const idx = layout.findIndex(c => c.id === catId);
    if (idx <= 0) return;
    const next = [...layout];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    updateLayout(next);
  };
  const moveCatDown = (catId: string) => {
    const idx = layout.findIndex(c => c.id === catId);
    if (idx >= layout.length - 1) return;
    const next = [...layout];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    updateLayout(next);
  };
  const renameCat = (catId: string, name: string) => {
    updateLayout(layout.map(c => c.id === catId ? { ...c, name } : c));
    setRenamingCat(null);
  };
  const changeColor = (catId: string, color: string) => {
    updateLayout(layout.map(c => c.id === catId ? { ...c, color } : c));
  };
  const deleteCat = (catId: string) => {
    updateLayout(layout.filter(c => c.id !== catId));
  };
  const addNewCategory = () => {
    if (!newCatName.trim()) return;
    const next: CategoryConfig[] = [...layout, {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      color: newCatColor,
      exerciseIds: [],
    }];
    updateLayout(next);
    setNewCatName('');
    setAddingCategory(false);
  };

  // Exercise ordering within a category
  const moveExUp = (catId: string, exId: string) => {
    updateLayout(layout.map(c => {
      if (c.id !== catId) return c;
      const ids = [...c.exerciseIds];
      const i = ids.indexOf(exId);
      if (i <= 0) return c;
      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
      return { ...c, exerciseIds: ids };
    }));
  };
  const moveExDown = (catId: string, exId: string) => {
    updateLayout(layout.map(c => {
      if (c.id !== catId) return c;
      const ids = [...c.exerciseIds];
      const i = ids.indexOf(exId);
      if (i >= ids.length - 1) return c;
      [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
      return { ...c, exerciseIds: ids };
    }));
  };
  const moveExToCategory = (exId: string, fromCatId: string, toCatId: string) => {
    updateLayout(layout.map(c => {
      if (c.id === fromCatId) return { ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) };
      if (c.id === toCatId) return { ...c, exerciseIds: [...c.exerciseIds, exId] };
      return c;
    }));
  };
  const addExToCategory = (exId: string, catId: string) => {
    // Move from wherever it is → catId
    const currentCat = layout.find(c => c.exerciseIds.includes(exId));
    if (!currentCat) return;
    moveExToCategory(exId, currentCat.id, catId);
    setAddingExToCat(null);
  };

  // Focus rename input when activated
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

  // Exercises not yet in any category (for "add exercise" flow)
  const unassignedExercises = EXERCISES.filter(e => !allAssignedExIds.has(e.id));

  return (
    <main className="min-h-screen bg-[#F6F1E7] py-8 px-4" style={{ colorScheme: 'light' }}>
      <div className="max-w-xl mx-auto">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-3xl font-semibold text-stone-800">Ankle PT</h1>
            <div className="flex items-center gap-2">
              <TimerWidget />
              {/* Edit layout toggle */}
              <button
                onPointerDown={() => {
                  setEditMode(m => !m);
                  setRenamingCat(null);
                  setMovingExercise(null);
                  setAddingExToCat(null);
                  setAddingCategory(false);
                }}
                className="h-9 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-colors"
                style={{
                  touchAction: 'manipulation',
                  background: editMode ? '#1c1917' : '#fff',
                  borderColor: editMode ? '#1c1917' : '#e7e5e4',
                  color: editMode ? '#fff' : '#78716c',
                }}
                title={editMode ? 'Done editing' : 'Edit layout'}
              >
                {editMode ? (
                  <>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                      <polyline points="2.5 8 6.5 12 13.5 4"/>
                    </svg>
                    Done
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <path d="M2 12.5V14h1.5l8-8L10 4.5l-8 8z"/><path d="M11.5 3l1.5 1.5"/>
                    </svg>
                    Edit
                  </>
                )}
              </button>
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

              // Exercises NOT in this category (for "add exercise" picker)
              const otherCatIds = layout
                .filter(c => c.id !== cat.id)
                .flatMap(c => c.exerciseIds);
              const exercisesElsewhere = otherCatIds.map(id => EXERCISE_MAP[id]).filter(Boolean);
              const availableToAdd = [...exercisesElsewhere, ...unassignedExercises];

              const isRenaming = renamingCat === cat.id;

              return (
                <section key={cat.id} className="mb-5">
                  {/* ── Category header */}
                  <div className={`flex items-center gap-2 mb-2.5 ${editMode ? 'bg-white rounded-2xl px-3 py-2 border border-stone-100 shadow-sm' : ''}`}>

                    {/* Edit mode: reorder arrows */}
                    {editMode && (
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          onPointerDown={() => moveCatUp(cat.id)}
                          disabled={catIdx === 0}
                          className="w-6 h-6 rounded flex items-center justify-center text-stone-400 hover:bg-stone-100 disabled:opacity-20 text-base leading-none"
                          style={{ touchAction: 'manipulation' }}
                        >↑</button>
                        <button
                          onPointerDown={() => moveCatDown(cat.id)}
                          disabled={catIdx === layout.length - 1}
                          className="w-6 h-6 rounded flex items-center justify-center text-stone-400 hover:bg-stone-100 disabled:opacity-20 text-base leading-none"
                          style={{ touchAction: 'manipulation' }}
                        >↓</button>
                      </div>
                    )}

                    {/* Collapse toggle */}
                    <button
                      onPointerDown={() => setCollapsed(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-stone-400 rounded hover:bg-stone-100 transition-colors"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 transition-transform"
                        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                        <path d="M1 3l5 5 5-5z"/>
                      </svg>
                    </button>

                    {/* Category name — editable in edit mode */}
                    {editMode && isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => renameCat(cat.id, renameValue || cat.name)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameCat(cat.id, renameValue || cat.name);
                          if (e.key === 'Escape') setRenamingCat(null);
                        }}
                        className="flex-1 text-base font-semibold text-stone-800 bg-stone-50 border border-stone-300 rounded-lg px-2 py-0.5 focus:outline-none"
                        style={{ fontSize: 16, fontFamily: 'Georgia, serif' }}
                      />
                    ) : (
                      <h2
                        className={`flex-1 font-serif text-lg font-semibold text-stone-800 leading-tight ${editMode ? 'cursor-pointer hover:text-stone-600' : ''}`}
                        onPointerDown={editMode ? () => { setRenamingCat(cat.id); setRenameValue(cat.name); } : undefined}
                      >
                        {cat.name}
                        {editMode && (
                          <span className="ml-1.5 text-[10px] font-sans font-normal text-stone-400">tap to rename</span>
                        )}
                      </h2>
                    )}

                    {/* Right side */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!editMode && (
                        <>
                          <span className="text-xs text-stone-400">{done}/{total}</span>
                          <span
                            className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full"
                            style={{ background: palette.light, color: palette.accent }}
                          >
                            {cat.color === 'green' ? 'Most days' : cat.color === 'orange' ? '~3× / week' : ''}
                          </span>
                        </>
                      )}

                      {editMode && (
                        <>
                          {/* Color picker dots */}
                          <div className="flex gap-1">
                            {COLOR_KEYS.map(c => (
                              <button
                                key={c}
                                onPointerDown={() => changeColor(cat.id, c)}
                                className="w-5 h-5 rounded-full transition-transform"
                                style={{
                                  background: COLOR_PALETTE[c].accent,
                                  transform: cat.color === c ? 'scale(1.3)' : 'scale(1)',
                                  boxShadow: cat.color === c ? `0 0 0 2px white, 0 0 0 3px ${COLOR_PALETTE[c].accent}` : 'none',
                                  touchAction: 'manipulation',
                                }}
                              />
                            ))}
                          </div>
                          {/* Delete category (only if empty) */}
                          {cat.exerciseIds.length === 0 && (
                            <button
                              onPointerDown={() => deleteCat(cat.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 text-sm"
                              style={{ touchAction: 'manipulation' }}
                              title="Delete category"
                            >×</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Exercise list */}
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {catExercises.map((ex, exIdx) => (
                        <div key={ex.id}>
                          <div className="flex items-stretch gap-2">
                            {/* Edit mode: exercise controls */}
                            {editMode && (
                              <div className="flex flex-col gap-1 justify-center flex-shrink-0">
                                <button
                                  onPointerDown={() => moveExUp(cat.id, ex.id)}
                                  disabled={exIdx === 0}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-400 bg-white border border-stone-100 disabled:opacity-20 text-sm"
                                  style={{ touchAction: 'manipulation' }}
                                >↑</button>
                                <button
                                  onPointerDown={() => moveExDown(cat.id, ex.id)}
                                  disabled={exIdx === catExercises.length - 1}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-400 bg-white border border-stone-100 disabled:opacity-20 text-sm"
                                  style={{ touchAction: 'manipulation' }}
                                >↓</button>
                                <button
                                  onPointerDown={() => setMovingExercise(movingExercise === ex.id ? null : ex.id)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border text-[10px] font-bold"
                                  style={{
                                    touchAction: 'manipulation',
                                    borderColor: movingExercise === ex.id ? palette.accent : '#e7e5e4',
                                    color: movingExercise === ex.id ? palette.accent : '#a8a29e',
                                  }}
                                  title="Move to another category"
                                >
                                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3">
                                    <path d="M7 2v10M2 7l5 5 5-5"/>
                                  </svg>
                                </button>
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <ExerciseCard
                                exercise={ex}
                                done={dayLog[ex.id] ?? false}
                                note={notes[ex.id] ?? ''}
                                today={selectedDate}
                                onToggle={() => !editMode && handleToggle(ex.id)}
                                onNoteSave={note => handleNoteSave(ex.id, note)}
                              />
                            </div>
                          </div>

                          {/* Move-to-category picker */}
                          {editMode && movingExercise === ex.id && (
                            <div className="ml-9 mt-1.5 flex flex-wrap gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 w-full mb-0.5">Move to:</span>
                              {layout.filter(c => c.id !== cat.id).map(otherCat => (
                                <button
                                  key={otherCat.id}
                                  onPointerDown={() => moveExToCategory(ex.id, cat.id, otherCat.id)}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
                                  style={{
                                    background: (COLOR_PALETTE[otherCat.color] ?? COLOR_PALETTE.green).light,
                                    color: (COLOR_PALETTE[otherCat.color] ?? COLOR_PALETTE.green).accent,
                                    borderColor: (COLOR_PALETTE[otherCat.color] ?? COLOR_PALETTE.green).accent + '40',
                                    touchAction: 'manipulation',
                                  }}
                                >
                                  → {otherCat.name}
                                </button>
                              ))}
                              <button
                                onPointerDown={() => setMovingExercise(null)}
                                className="text-xs px-3 py-1.5 rounded-full bg-stone-100 text-stone-500"
                                style={{ touchAction: 'manipulation' }}
                              >Cancel</button>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* ── Add exercise to category (edit mode) */}
                      {editMode && (
                        <div className="mt-1">
                          {addingExToCat === cat.id ? (
                            <div className="bg-white rounded-xl border border-stone-100 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                                Move here from another category:
                              </p>
                              {availableToAdd.length > 0 ? (
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {availableToAdd.map(e => (
                                    <button
                                      key={e.id}
                                      onPointerDown={() => addExToCategory(e.id, cat.id)}
                                      className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-stone-50 text-stone-700 flex items-center gap-2"
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <span className="text-stone-400 text-xs">
                                        {layout.find(c => c.exerciseIds.includes(e.id))?.name ?? 'Unassigned'}
                                      </span>
                                      <span className="font-medium">{e.name}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-stone-400 py-2">All exercises are in this category.</p>
                              )}
                              <button
                                onPointerDown={() => setAddingExToCat(null)}
                                className="mt-2 text-xs text-stone-400 font-medium"
                                style={{ touchAction: 'manipulation' }}
                              >Cancel</button>
                            </div>
                          ) : (
                            <button
                              onPointerDown={() => setAddingExToCat(addingExToCat === cat.id ? null : cat.id)}
                              className="text-xs font-semibold flex items-center gap-1 px-2 py-1.5 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors"
                              style={{ touchAction: 'manipulation' }}
                            >
                              <span className="text-base leading-none">＋</span> Add exercise
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collapsed summary */}
                  {isCollapsed && catExercises.length > 0 && (
                    <button
                      onPointerDown={() => setCollapsed(prev => ({ ...prev, [cat.id]: false }))}
                      className="w-full py-2 rounded-xl text-xs font-semibold text-center border border-dashed transition-colors"
                      style={{
                        borderColor: palette.accent + '40',
                        color: palette.accent,
                        background: palette.light + '60',
                        touchAction: 'manipulation',
                      }}
                    >
                      {done}/{total} done · tap to expand
                    </button>
                  )}
                </section>
              );
            })}

            {/* ── Add new category (edit mode) */}
            {editMode && (
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
                      className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-3 focus:outline-none focus:ring-2"
                      style={{ fontSize: 16, colorScheme: 'light' }}
                    />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Color</p>
                    <div className="flex gap-3 mb-4">
                      {COLOR_KEYS.map(c => (
                        <button
                          key={c}
                          onPointerDown={() => setNewCatColor(c)}
                          className="w-8 h-8 rounded-full transition-transform"
                          style={{
                            background: COLOR_PALETTE[c].accent,
                            transform: newCatColor === c ? 'scale(1.25)' : 'scale(1)',
                            boxShadow: newCatColor === c ? `0 0 0 2px white, 0 0 0 3.5px ${COLOR_PALETTE[c].accent}` : 'none',
                            touchAction: 'manipulation',
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onPointerDown={addNewCategory}
                        className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl"
                        style={{ background: COLOR_PALETTE[newCatColor].accent, touchAction: 'manipulation' }}
                      >
                        Add category
                      </button>
                      <button
                        onPointerDown={() => { setAddingCategory(false); setNewCatName(''); }}
                        className="px-4 py-2.5 text-sm text-stone-500 rounded-xl hover:bg-stone-100"
                        style={{ touchAction: 'manipulation' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onPointerDown={() => setAddingCategory(true)}
                    className="w-full py-3.5 rounded-2xl border-2 border-dashed border-stone-200 text-sm font-semibold text-stone-400 hover:border-stone-300 hover:text-stone-500 transition-colors"
                    style={{ touchAction: 'manipulation' }}
                  >
                    ＋ Add category
                  </button>
                )}
              </div>
            )}

            {/* ── Health tracker */}
            <section className="mb-5">
              <HealthTracker today={selectedDate} />
            </section>

            {/* ── Week tracker */}
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
