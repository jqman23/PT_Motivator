'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { EXERCISES, Exercise } from '@/lib/exercises';
import { CategoryConfig, COLOR_PALETTE, COLOR_KEYS } from '@/lib/layout';
import ExerciseCard from '@/components/ExerciseCard';
import WeekTracker from '@/components/WeekTracker';
import HealthTracker from '@/components/HealthTracker';
import CalendarModal from '@/components/CalendarModal';
import ManageModal from '@/components/ManageModal';
import LibraryModal from '@/components/LibraryModal';
import TimerWidget from '@/components/TimerWidget';
import PTSessionsModal from '@/components/PTSessionsModal';
import ReportingModal from '@/components/ReportingModal';

// ─── Types ───────────────────────────────────────────────────────────────────

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;
type PTSession = { date: string; note?: string };

// ─── Constants ────────────────────────────────────────────────────────────────

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
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);

  // Inline editing
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [colorMenuCat, setColorMenuCat] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('blue');

  // Popups
  const [showManage, setShowManage] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryCatId, setLibraryCatId] = useState<string | null>(null);
  const [showPTSessions, setShowPTSessions] = useState(false);
  const [showReporting, setShowReporting] = useState(false);

  // PT Sessions
  const [ptSessions, setPtSessions] = useState<PTSession[]>([]);

  const weekStart = offsetDate(today, -6);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Merged master exercise list (built-ins + custom)
  const allExercises = useMemo(() => [...EXERCISES, ...customExercises], [customExercises]);
  const exerciseMap = useMemo(() => Object.fromEntries(allExercises.map(e => [e.id, e])), [allExercises]);

  // ── Restore date from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('pt-selected-date');
    if (stored && stored <= todayStr()) setSelectedDate(stored);
  }, []);

  // ── Load layout + custom exercises from DB
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

    fetch('/api/config?key=customExercises')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.value)) setCustomExercises(data.value as Exercise[]); })
      .catch(console.error);

    fetch('/api/config?key=ptSessions')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.value)) {
          setPtSessions(
            data.value.map((item: string | PTSession) =>
              typeof item === 'string' ? { date: item, note: '' } : item
            )
          );
        }
      })
      .catch(console.error);
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

  // ── Custom exercise save helper
  const updateCustom = useCallback((next: Exercise[]) => {
    setCustomExercises(next);
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'customExercises', value: next }),
    }).catch(console.error);
  }, []);

  // ── PT sessions save helper
  const updatePtSessions = useCallback((next: PTSession[]) => {
    setPtSessions(next);
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ptSessions', value: next }),
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
          log: allExercises.map(ex => ({ exerciseId: ex.id, completed: dayLog[ex.id] ?? false })),
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

  // ── Category management (inline)
  const renameCat = (catId: string, name: string) => {
    updateLayout(layout.map(c => c.id === catId ? { ...c, name } : c));
    setRenamingCat(null);
  };
  const changeColor = (catId: string, color: string) => {
    updateLayout(layout.map(c => c.id === catId ? { ...c, color } : c));
    setColorMenuCat(null);
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

  // ── Library actions
  const addExToCategory = (exId: string, catId: string) => {
    const next = layout.map(c => ({ ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) }))
      .map(c => c.id === catId ? { ...c, exerciseIds: [...c.exerciseIds, exId] } : c);
    updateLayout(next);
  };
  const createCustom = (ex: Exercise) => updateCustom([...customExercises, ex]);
  const deleteCustom = (exId: string) => {
    updateCustom(customExercises.filter(e => e.id !== exId));
    updateLayout(layout.map(c => ({ ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) })));
  };
  const openLibraryFor = (catId: string) => { setLibraryCatId(catId); setShowLibrary(true); };

  useEffect(() => {
    if (renamingCat && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingCat]);

  // ── Derived
  const dayLog = log[selectedDate] || {};
  const isToday = selectedDate === today;

  return (
    <main className="min-h-screen bg-[#F6F1E7] py-8 px-4" style={{ colorScheme: 'light' }}>
      <div className="max-w-xl mx-auto">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-3xl font-semibold text-stone-800">Ankle PT</h1>
            <div className="flex items-center gap-1.5">
              <TimerWidget />
              {/* Library */}
              <button
                onClick={() => { setLibraryCatId(null); setShowLibrary(true); }}
                className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-500 shadow-sm"
                style={{ touchAction: 'manipulation' }}
                title="Exercise library"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M4 3h5a2 2 0 0 1 2 2v11a1.5 1.5 0 0 0-1.5-1.5H4z" />
                  <path d="M16 3h-3a2 2 0 0 0-2 2v11a1.5 1.5 0 0 1 1.5-1.5H16z" />
                </svg>
              </button>
              {/* Manage / reorder */}
              <button
                onClick={() => setShowManage(true)}
                className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-500 shadow-sm"
                style={{ touchAction: 'manipulation' }}
                title="Reorder & edit"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M7 5h10M7 10h10M7 15h10" />
                  <circle cx="3.5" cy="5" r="1" fill="currentColor" stroke="none" />
                  <circle cx="3.5" cy="10" r="1" fill="currentColor" stroke="none" />
                  <circle cx="3.5" cy="15" r="1" fill="currentColor" stroke="none" />
                </svg>
              </button>
              {/* Calendar */}
              <button
                onClick={() => setShowCalendar(true)}
                className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-500 shadow-sm"
                style={{ touchAction: 'manipulation' }}
                title="Calendar"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <rect x="2" y="3" width="16" height="16" rx="2"/><path d="M2 8h16"/>
                  <path d="M6 1v4M14 1v4"/>
                  <rect x="5.5" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                  <rect x="9" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                  <rect x="12.5" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                </svg>
              </button>
              {/* PT Sessions */}
              <button
                onClick={() => setShowPTSessions(true)}
                className="w-9 h-9 rounded-xl border flex items-center justify-center shadow-sm transition-colors"
                style={{
                  touchAction: 'manipulation',
                  background: ptSessions.some(s => s.date === today) ? '#FBF5E8' : 'white',
                  borderColor: ptSessions.some(s => s.date === today) ? '#D9A94B' : '#e7e5e4',
                  color: ptSessions.some(s => s.date === today) ? '#D9A94B' : '#78716c',
                }}
                title="PT sessions"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <circle cx="8.5" cy="5.5" r="2.5" />
                  <path d="M2 18v-1.5a6 6 0 0 1 11.5-1" />
                  <path d="M16 11v5M13.5 13.5h5" />
                </svg>
              </button>
              {/* Reporting */}
              <button
                onClick={() => setShowReporting(true)}
                className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-500 shadow-sm"
                style={{ touchAction: 'manipulation' }}
                title="Progress report"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M3 15l3.5-5.5 3.5 3 4-6" />
                  <path d="M2 17.5h16" />
                  <path d="M2 3v14.5" />
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

          {/* Action row: Today / Save day / Clear day — all horizontal */}
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
            {!confirmClearDay && (
              <button onPointerDown={() => setConfirmClearDay(true)}
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{ color: '#a8a29e', background: '#f5f5f4', touchAction: 'manipulation' }}>
                {clearing ? 'Clearing…' : '× Clear'}
              </button>
            )}
          </div>

          {/* Confirm clear — drops below when triggered */}
          {confirmClearDay && (
            <div className="mt-2 flex justify-center">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <span className="text-xs font-semibold" style={{ color: '#991b1b' }}>Clear ALL data for {displayForDate(selectedDate)}?</span>
                <button onPointerDown={handleClearDay}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg text-white"
                  style={{ background: '#ef4444', touchAction: 'manipulation' }}>Yes, clear</button>
                <button onPointerDown={() => setConfirmClearDay(false)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                  style={{ color: '#78716c', background: '#f5f5f4', touchAction: 'manipulation' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {showCalendar && (
          <CalendarModal today={today} selectedDate={selectedDate}
            ptSessions={ptSessions}
            onSelectDate={d => changeDate(d)} onClose={() => setShowCalendar(false)} />
        )}

        {showPTSessions && (
          <PTSessionsModal
            sessions={ptSessions}
            today={today}
            onChange={updatePtSessions}
            onClose={() => setShowPTSessions(false)}
          />
        )}

        {showReporting && (
          <ReportingModal
            today={today}
            ptSessions={ptSessions}
            onClose={() => setShowReporting(false)}
          />
        )}

        {showManage && (
          <ManageModal
            layout={layout}
            exerciseMap={exerciseMap}
            onChange={updateLayout}
            onRequestAddExercise={openLibraryFor}
            onClose={() => setShowManage(false)}
          />
        )}

        {showLibrary && (
          <LibraryModal
            builtIns={EXERCISES}
            customExercises={customExercises}
            layout={layout}
            addToCatId={libraryCatId}
            onPick={addExToCategory}
            onCreateCustom={createCustom}
            onDeleteCustom={deleteCustom}
            onClose={() => { setShowLibrary(false); setLibraryCatId(null); }}
          />
        )}

        {/* ── Exercise sections ──────────────────────────────────────────── */}
        {loading || layoutLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-[#7E9B86] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {layout.map((cat) => {
              const palette = COLOR_PALETTE[cat.color] ?? COLOR_PALETTE.green;
              const isCollapsed = !!collapsed[cat.id];
              const catExercises: Exercise[] = cat.exerciseIds.map(id => exerciseMap[id]).filter(Boolean);
              const done = catExercises.filter(e => dayLog[e.id]).length;
              const total = catExercises.length;
              const isRenaming = renamingCat === cat.id;

              return (
                <section key={cat.id} className="mb-5">
                  {/* ── Category header */}
                  <div className="flex items-center gap-1.5 mb-2.5">
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
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Exercise list */}
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {catExercises.map((ex) => (
                        <ExerciseCard
                          key={ex.id}
                          exercise={ex}
                          done={dayLog[ex.id] ?? false}
                          note={notes[ex.id] ?? ''}
                          today={selectedDate}
                          onToggle={() => handleToggle(ex.id)}
                          onNoteSave={note => handleNoteSave(ex.id, note)}
                        />
                      ))}

                      {/* Add exercise (from library) */}
                      <button
                        onPointerDown={() => openLibraryFor(cat.id)}
                        className="ml-1 text-xs font-semibold flex items-center gap-1 px-2 py-1.5 rounded-lg text-stone-400 hover:bg-stone-100"
                        style={{ touchAction: 'manipulation' }}
                      >
                        <span className="text-base leading-none">＋</span> Add exercise
                      </button>
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
              <WeekTracker log={log} today={today} selectedDate={selectedDate} ptSessions={ptSessions} />
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
