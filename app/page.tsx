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
import TreatmentsModal from '@/components/TreatmentsModal';
import ExerciseInfoModal from '@/components/ExerciseInfoModal';
import MasterDatabaseModal from '@/components/MasterDatabaseModal';
import WidgetSettingsModal, { WidgetPrefs } from '@/components/WidgetSettingsModal';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;
type PTSession = { date: string; note?: string };

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

const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  timer: true,
  info: true,
  calendar: true,
  treatments: true,
  ptSessions: true,
  reporting: true,
  masterDatabase: true,
};

function getDailyQuote() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  return QUOTES[Math.floor((Date.now() - start.getTime()) / 86400000) % QUOTES.length];
}

function seedExerciseLibrary(legacyCustom: Exercise[] = []): Exercise[] {
  const byId = new Map<string, Exercise>();
  for (const ex of EXERCISES) byId.set(ex.id, { ...ex, origin: ex.origin ?? 'hep' });
  for (const ex of legacyCustom) byId.set(ex.id, { ...ex, origin: ex.origin ?? 'patient_added' });
  return Array.from(byId.values());
}

function makeDefaultLayout(): CategoryConfig[] {
  return [
    { id: 'daily-mobility', name: 'Daily mobility & balance', color: 'green', exerciseIds: EXERCISES.filter(e => e.cat === 'mobility').map(e => e.id) },
    { id: 'strength-day', name: 'Strength day', color: 'orange', exerciseIds: EXERCISES.filter(e => e.cat === 'strength').map(e => e.id) },
  ];
}

function dateStr(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function todayStr() { return dateStr(new Date()); }
function offsetDate(base: string, days: number) { const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + days); return dateStr(d); }
function displayForDate(ds: string) {
  const today = todayStr(); const yesterday = offsetDate(today, -1);
  if (ds === today) return 'Today';
  if (ds === yesterday) return 'Yesterday';
  return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function IconButton({ title, onClick, children, active }: { title: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-9 h-9 rounded-xl border flex items-center justify-center shadow-sm flex-shrink-0 transition-all hover:bg-stone-50 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
      style={{
        touchAction: 'manipulation',
        background: active ? '#FBF5E8' : 'white',
        borderColor: active ? '#D9A94B' : '#e7e5e4',
        color: active ? '#D9A94B' : '#78716c',
      }}
      title={title}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const today = todayStr();

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

  const [layout, setLayout] = useState<CategoryConfig[]>([]);
  const [layoutLoading, setLayoutLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [exerciseLibrary, setExerciseLibrary] = useState<Exercise[]>([]);

  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [colorMenuCat, setColorMenuCat] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('blue');
  const [appTitle, setAppTitle] = useState('Ankle PT');

  const [showManage, setShowManage] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryCatId, setLibraryCatId] = useState<string | null>(null);
  const [showPTSessions, setShowPTSessions] = useState(false);
  const [showReporting, setShowReporting] = useState(false);
  const [showTreatments, setShowTreatments] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const [showMasterDatabase, setShowMasterDatabase] = useState(false);

  const [ptSessions, setPtSessions] = useState<PTSession[]>([]);
  const [widgetPrefs, setWidgetPrefs] = useState<WidgetPrefs>(DEFAULT_WIDGET_PREFS);

  const weekStart = offsetDate(today, -6);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const allExercises = useMemo(() => exerciseLibrary, [exerciseLibrary]);
  const exerciseMap = useMemo(() => Object.fromEntries(allExercises.map(e => [e.id, e])), [allExercises]);

  useEffect(() => {
    const stored = localStorage.getItem('pt-selected-date');
    if (stored && stored <= todayStr()) setSelectedDate(stored);
  }, []);

  useEffect(() => {
    fetch('/api/config?key=layout')
      .then(r => r.json())
      .then(data => {
        if (data.value && Array.isArray(data.value) && data.value.length > 0) setLayout(data.value as CategoryConfig[]);
        else {
          const def = makeDefaultLayout();
          setLayout(def);
          fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'layout', value: def }) }).catch(console.error);
        }
      })
      .catch(() => setLayout(makeDefaultLayout()))
      .finally(() => setLayoutLoading(false));

    Promise.all([
      fetch('/api/config?key=exerciseLibrary').then(r => r.json()).catch(() => ({ value: null })),
      fetch('/api/config?key=customExercises').then(r => r.json()).catch(() => ({ value: null })),
    ])
      .then(([libraryData, legacyCustomData]) => {
        if (Array.isArray(libraryData.value) && libraryData.value.length > 0) { setExerciseLibrary(libraryData.value as Exercise[]); return; }
        const legacyCustom = Array.isArray(legacyCustomData.value) ? legacyCustomData.value as Exercise[] : [];
        const seeded = seedExerciseLibrary(legacyCustom);
        setExerciseLibrary(seeded);
        fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'exerciseLibrary', value: seeded }) }).catch(console.error);
      })
      .catch(() => setExerciseLibrary(seedExerciseLibrary()));

    fetch('/api/config?key=appTitle').then(r => r.json()).then(data => { if (typeof data.value === 'string' && data.value.trim()) setAppTitle(data.value); }).catch(console.error);
    fetch('/api/config?key=ptSessions').then(r => r.json()).then(data => { if (Array.isArray(data.value)) setPtSessions(data.value.map((item: string | PTSession) => typeof item === 'string' ? { date: item, note: '' } : item)); }).catch(console.error);
    fetch('/api/config?key=widgetPrefs').then(r => r.json()).then(data => { if (data.value && typeof data.value === 'object') setWidgetPrefs({ ...DEFAULT_WIDGET_PREFS, ...data.value }); }).catch(console.error);
  }, []);

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

  useEffect(() => { setLoading(true); Promise.all([loadLog(selectedDate), loadNotes(selectedDate)]).finally(() => setLoading(false)); }, [loadLog, loadNotes, selectedDate]);

  const updateLayout = useCallback((next: CategoryConfig[]) => { setLayout(next); fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'layout', value: next }) }).catch(console.error); }, []);
  const updateExerciseLibrary = useCallback((next: Exercise[]) => { setExerciseLibrary(next); fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'exerciseLibrary', value: next }) }).catch(console.error); }, []);
  const updateAppTitle = useCallback((next: string) => { const clean = next.trim() || 'Ankle PT'; setAppTitle(clean); fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'appTitle', value: clean }) }).catch(console.error); }, []);
  const updatePtSessions = useCallback((next: PTSession[]) => { setPtSessions(next); fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ptSessions', value: next }) }).catch(console.error); }, []);
  const updateWidgetPrefs = useCallback((next: WidgetPrefs) => { setWidgetPrefs(next); fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'widgetPrefs', value: next }) }).catch(console.error); }, []);

  const changeDate = (date: string) => { setSelectedDate(date); localStorage.setItem('pt-selected-date', date); setNotes({}); setConfirmClearDay(false); };
  const handleDateChange = (dir: -1 | 1) => { const next = offsetDate(selectedDate, dir); if (next > today) return; changeDate(next); };

  const handleSaveAll = async () => {
    setSavingAll(true); setSaveAllDone(false);
    try {
      const dayLog = log[selectedDate] || {};
      await fetch('/api/save-day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate, log: allExercises.map(ex => ({ exerciseId: ex.id, completed: dayLog[ex.id] ?? false })), notes: Object.entries(notes).map(([exerciseId, note]) => ({ exerciseId, note })) }) });
      setSaveAllDone(true); setTimeout(() => setSaveAllDone(false), 3000);
    } catch (err) { console.error(err); }
    finally { setSavingAll(false); }
  };

  const handleToggle = async (exerciseId: string) => {
    const current = log[selectedDate]?.[exerciseId] ?? false;
    const next = !current;
    setLog(prev => ({ ...prev, [selectedDate]: { ...(prev[selectedDate] || {}), [exerciseId]: next } }));
    setSaving(true);
    try { await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate, exerciseId, completed: next }) }); }
    catch { setLog(prev => ({ ...prev, [selectedDate]: { ...(prev[selectedDate] || {}), [exerciseId]: current } })); }
    finally { setSaving(false); }
  };

  const handleNoteSave = async (exerciseId: string, note: string) => { setNotes(prev => ({ ...prev, [exerciseId]: note })); try { await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate, exerciseId, note }) }); } catch (err) { console.error(err); } };
  const handleClearDay = async () => { setClearing(true); setConfirmClearDay(false); try { await Promise.all([fetch(`/api/log?date=${selectedDate}`, { method: 'DELETE' }), fetch(`/api/notes?date=${selectedDate}`, { method: 'DELETE' }), fetch(`/api/health?date=${selectedDate}`, { method: 'DELETE' })]); setLog(prev => ({ ...prev, [selectedDate]: {} })); setNotes({}); } catch (err) { console.error(err); } finally { setClearing(false); } };

  const renameCat = (catId: string, name: string) => { updateLayout(layout.map(c => c.id === catId ? { ...c, name } : c)); setRenamingCat(null); };
  const changeColor = (catId: string, color: string) => { updateLayout(layout.map(c => c.id === catId ? { ...c, color } : c)); setColorMenuCat(null); };
  const addNewCategory = () => { if (!newCatName.trim()) return; updateLayout([...layout, { id: `cat-${Date.now()}`, name: newCatName.trim(), color: newCatColor, exerciseIds: [] }]); setNewCatName(''); setAddingCategory(false); };

  const addExToCategory = (exId: string, catId: string) => {
    const currentCat = layout.find(c => c.exerciseIds.includes(exId));
    if (currentCat?.id === catId) { updateLayout(layout.map(c => c.id === catId ? { ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) } : c)); return; }
    updateLayout(layout.map(c => ({ ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) })).map(c => c.id === catId ? { ...c, exerciseIds: [...c.exerciseIds, exId] } : c));
  };
  const createCustom = (ex: Exercise) => updateExerciseLibrary([...exerciseLibrary, { ...ex, origin: ex.origin ?? 'patient_added' }]);
  const updateExercise = (nextExercise: Exercise) => updateExerciseLibrary(exerciseLibrary.map(ex => ex.id === nextExercise.id ? nextExercise : ex));
  const deleteCustom = (exId: string) => { updateExerciseLibrary(exerciseLibrary.filter(e => e.id !== exId)); updateLayout(layout.map(c => ({ ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) }))); };
  const openLibraryFor = (catId: string) => { setLibraryCatId(catId); setShowLibrary(true); };

  useEffect(() => { if (renamingCat && renameInputRef.current) { renameInputRef.current.focus(); renameInputRef.current.select(); } }, [renamingCat]);

  const dayLog = log[selectedDate] || {};
  const isToday = selectedDate === today;

  const DayControls = ({ bottom = false }: { bottom?: boolean }) => (
    <div className={`flex items-center gap-3 ${bottom ? 'mt-2' : 'mt-3'}`}>
      <button onClick={() => handleDateChange(-1)} className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 text-lg" style={{ touchAction: 'manipulation' }}>‹</button>
      <div className="flex-1 text-center"><span className="text-sm font-semibold text-stone-700">{displayForDate(selectedDate)}</span>{!isToday && <span className="text-xs text-stone-400 ml-2">{selectedDate}</span>}</div>
      <button onClick={() => handleDateChange(1)} disabled={isToday} className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 disabled:opacity-30 text-lg" style={{ touchAction: 'manipulation' }}>›</button>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#F6F1E7] py-8 px-4" style={{ colorScheme: 'light' }}>
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2">
            <input value={appTitle} onChange={e => setAppTitle(e.target.value)} onBlur={e => updateAppTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="hidden sm:block font-serif text-3xl font-semibold text-stone-800 bg-transparent border border-transparent hover:border-stone-200 focus:border-stone-300 focus:bg-white/60 rounded-lg px-1 -ml-1 focus:outline-none max-w-[220px]" style={{ fontSize: 30, colorScheme: 'light' }} title="Edit app title" />
            <div className="flex items-center gap-1.5 overflow-x-auto flex-1 justify-end [-ms-overflow-style:none] [scrollbar-width:none]">
              {widgetPrefs.timer && <TimerWidget />}
              <IconButton title="Exercise library" onClick={() => { setLibraryCatId(null); setShowLibrary(true); }}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M4 3h5a2 2 0 0 1 2 2v11a1.5 1.5 0 0 0-1.5-1.5H4z"/><path d="M16 3h-3a2 2 0 0 0-2 2v11a1.5 1.5 0 0 1 1.5-1.5H16z"/></svg></IconButton>
              {widgetPrefs.info && <IconButton title="Exercise guide" onClick={() => setShowInfo(true)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6h.01"/></svg></IconButton>}
              <IconButton title="Reorder & edit" onClick={() => setShowManage(true)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M7 5h10M7 10h10M7 15h10"/><circle cx="3.5" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="15" r="1" fill="currentColor" stroke="none"/></svg></IconButton>
              {widgetPrefs.calendar && <IconButton title="Calendar" onClick={() => setShowCalendar(true)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="3" width="16" height="16" rx="2"/><path d="M2 8h16"/><path d="M6 1v4M14 1v4"/><rect x="5.5" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/><rect x="9" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/><rect x="12.5" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/></svg></IconButton>}
              {widgetPrefs.treatments && <IconButton title="Meds / treatments" onClick={() => setShowTreatments(true)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M7 3h6v4H7z"/><path d="M6 7h8l1 10H5z"/><path d="M8 12h4M10 10v4"/></svg></IconButton>}
              {widgetPrefs.ptSessions && <IconButton title="PT sessions" onClick={() => setShowPTSessions(true)} active={ptSessions.some(s => s.date === today)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="8.5" cy="5.5" r="2.5"/><path d="M2 18v-1.5a6 6 0 0 1 11.5-1"/><path d="M16 11v5M13.5 13.5h5"/></svg></IconButton>}
              {widgetPrefs.reporting && <IconButton title="Progress report" onClick={() => setShowReporting(true)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 15l3.5-5.5 3.5 3 4-6"/><path d="M2 17.5h16"/><path d="M2 3v14.5"/></svg></IconButton>}
              {widgetPrefs.masterDatabase && <span className="hidden sm:inline-flex"><IconButton title="Master database" onClick={() => setShowMasterDatabase(true)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><ellipse cx="10" cy="4" rx="6" ry="2.2"/><path d="M4 4v8c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V4"/><path d="M4 8c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/><path d="M4 12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/></svg></IconButton></span>}
              <IconButton title="Widget settings" onClick={() => setShowWidgetSettings(true)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="10" cy="10" r="3"/><path d="M10 1.8v2M10 16.2v2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M1.8 10h2M16.2 10h2M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg></IconButton>
            </div>
          </div>

          <h1 className="sm:hidden text-center font-serif text-3xl font-semibold text-stone-800 mt-3">{appTitle}</h1>
          <DayControls />
          {saving && <p className="text-xs mt-1 text-center animate-pulse" style={{ color: '#7E9B86' }}>Saving…</p>}
          <div className="mt-2 flex items-center justify-center gap-2">
            {!isToday && <button onPointerDown={() => changeDate(today)} className="text-xs font-semibold px-3 py-1 rounded-full" style={{ color: '#7E9B86', background: '#E4ECE6', touchAction: 'manipulation' }}>↩ Today</button>}
            <button onPointerDown={handleSaveAll} disabled={savingAll} className="text-xs font-semibold px-3 py-1 rounded-full transition-colors" style={{ color: saveAllDone ? '#fff' : '#5B9BD5', background: saveAllDone ? '#5B9BD5' : '#dbeafe', touchAction: 'manipulation' }}>{savingAll ? 'Saving…' : saveAllDone ? '✓ Saved' : '↑ Save day'}</button>
            {!confirmClearDay && <button onPointerDown={() => setConfirmClearDay(true)} className="text-xs font-medium px-3 py-1 rounded-full" style={{ color: '#a8a29e', background: '#f5f5f4', touchAction: 'manipulation' }}>{clearing ? 'Clearing…' : '× Clear'}</button>}
          </div>
          {confirmClearDay && <div className="mt-2 flex justify-center"><div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}><span className="text-xs font-semibold" style={{ color: '#991b1b' }}>Are you sure? Clear ALL data for {displayForDate(selectedDate)}?</span><button onPointerDown={handleClearDay} className="text-xs font-bold px-2.5 py-1 rounded-lg text-white" style={{ background: '#ef4444', touchAction: 'manipulation' }}>Yes, clear</button><button onPointerDown={() => setConfirmClearDay(false)} className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ color: '#78716c', background: '#f5f5f4', touchAction: 'manipulation' }}>Cancel</button></div></div>}
        </div>

        {showCalendar && <CalendarModal today={today} selectedDate={selectedDate} ptSessions={ptSessions} exercises={allExercises} onSelectDate={d => changeDate(d)} onClose={() => setShowCalendar(false)} />}
        {showPTSessions && <PTSessionsModal sessions={ptSessions} today={today} onChange={updatePtSessions} onClose={() => setShowPTSessions(false)} />}
        {showReporting && <ReportingModal today={today} ptSessions={ptSessions} onClose={() => setShowReporting(false)} />}
        {showTreatments && <TreatmentsModal today={today} selectedDate={selectedDate} onClose={() => setShowTreatments(false)} />}
        {showInfo && <ExerciseInfoModal layout={layout} exerciseMap={exerciseMap} onClose={() => setShowInfo(false)} />}
        {showWidgetSettings && <WidgetSettingsModal prefs={widgetPrefs} onChange={updateWidgetPrefs} onClose={() => setShowWidgetSettings(false)} />}
        {showMasterDatabase && <MasterDatabaseModal exercises={allExercises} layout={layout} onLibraryChange={updateExerciseLibrary} onLayoutChange={updateLayout} onClose={() => setShowMasterDatabase(false)} />}
        {showManage && <ManageModal layout={layout} exerciseMap={exerciseMap} onChange={updateLayout} onRequestAddExercise={openLibraryFor} onDeleteExercise={deleteCustom} onClose={() => setShowManage(false)} />}
        {showLibrary && <LibraryModal builtIns={[]} customExercises={exerciseLibrary} layout={layout} addToCatId={libraryCatId} onPick={addExToCategory} onCreateCustom={createCustom} onUpdateCustom={updateExercise} onDeleteCustom={deleteCustom} onClose={() => { setShowLibrary(false); setLibraryCatId(null); }} />}

        {loading || layoutLoading ? (
          <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-[#7E9B86] border-t-transparent rounded-full animate-spin" /></div>
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
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <button onPointerDown={() => setCollapsed(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))} className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-stone-400 rounded hover:bg-stone-100" style={{ touchAction: 'manipulation' }}><svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}><path d="M1 3l5 5 5-5z"/></svg></button>
                    {isRenaming ? <input ref={renameInputRef} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => renameCat(cat.id, renameValue.trim() || cat.name)} onKeyDown={e => { if (e.key === 'Enter') renameCat(cat.id, renameValue.trim() || cat.name); if (e.key === 'Escape') setRenamingCat(null); }} className="flex-1 min-w-0 text-lg font-semibold text-stone-800 bg-stone-50 border border-stone-300 rounded-lg px-2 py-0.5 focus:outline-none" style={{ fontSize: 16, fontFamily: 'Georgia, serif' }} /> : <h2 className="flex-1 min-w-0 font-serif text-lg font-semibold text-stone-800 leading-tight truncate cursor-text" onPointerDown={() => { setRenamingCat(cat.id); setRenameValue(cat.name); }} title="Tap to rename">{cat.name}</h2>}
                    <span className="text-xs text-stone-400 flex-shrink-0">{done}/{total}</span>
                    <div className="relative flex-shrink-0"><button onPointerDown={() => setColorMenuCat(colorMenuCat === cat.id ? null : cat.id)} className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: palette.accent, touchAction: 'manipulation' }} title="Change color" />{colorMenuCat === cat.id && <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg border border-stone-100 p-2 flex gap-2">{COLOR_KEYS.map(c => <button key={c} onPointerDown={() => changeColor(cat.id, c)} className="w-6 h-6 rounded-full" style={{ background: COLOR_PALETTE[c].accent, boxShadow: cat.color === c ? `0 0 0 2px white, 0 0 0 3.5px ${COLOR_PALETTE[c].accent}` : 'none', touchAction: 'manipulation' }} />)}</div>}</div>
                  </div>
                  {!isCollapsed && <div className="space-y-2">{catExercises.map(ex => <ExerciseCard key={ex.id} exercise={ex} done={dayLog[ex.id] ?? false} note={notes[ex.id] ?? ''} today={selectedDate} onToggle={() => handleToggle(ex.id)} onNoteSave={note => handleNoteSave(ex.id, note)} />)}<button onPointerDown={() => openLibraryFor(cat.id)} className="ml-1 text-xs font-semibold flex items-center gap-1 px-2 py-1.5 rounded-lg text-stone-400 hover:bg-stone-100" style={{ touchAction: 'manipulation' }}><span className="text-base leading-none">＋</span> Add exercise</button></div>}
                  {isCollapsed && <button onPointerDown={() => setCollapsed(prev => ({ ...prev, [cat.id]: false }))} className="w-full py-2 rounded-xl text-xs font-semibold text-center border border-dashed" style={{ borderColor: palette.accent + '40', color: palette.accent, background: palette.light + '60', touchAction: 'manipulation' }}>{done}/{total} done · tap to expand</button>}
                </section>
              );
            })}

            <div className="mb-5">
              {addingCategory ? <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">New category</p><input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNewCategory()} placeholder="Category name…" autoFocus className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 mb-3 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} /><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Color</p><div className="flex gap-3 mb-4">{COLOR_KEYS.map(c => <button key={c} onPointerDown={() => setNewCatColor(c)} className="w-8 h-8 rounded-full" style={{ background: COLOR_PALETTE[c].accent, transform: newCatColor === c ? 'scale(1.25)' : 'scale(1)', boxShadow: newCatColor === c ? `0 0 0 2px white, 0 0 0 3.5px ${COLOR_PALETTE[c].accent}` : 'none', touchAction: 'manipulation' }} />)}</div><div className="flex gap-2"><button onPointerDown={addNewCategory} className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl" style={{ background: COLOR_PALETTE[newCatColor].accent, touchAction: 'manipulation' }}>Add category</button><button onPointerDown={() => { setAddingCategory(false); setNewCatName(''); }} className="px-4 py-2.5 text-sm text-stone-500 rounded-xl hover:bg-stone-100" style={{ touchAction: 'manipulation' }}>Cancel</button></div></div> : <button onPointerDown={() => setAddingCategory(true)} className="w-full py-3.5 rounded-2xl border-2 border-dashed border-stone-200 text-sm font-semibold text-stone-400 hover:border-stone-300 hover:text-stone-500" style={{ touchAction: 'manipulation' }}>＋ Add category</button>}
            </div>

            <section className="mb-5"><HealthTracker today={selectedDate} /></section>
            <section className="mb-5"><WeekTracker log={log} today={today} selectedDate={selectedDate} ptSessions={ptSessions} exercises={allExercises} onSelectDate={changeDate} /></section>
            <div className="mb-5 rounded-2xl border border-stone-100 bg-white p-3 shadow-sm"><DayControls bottom /></div>
            <p className="text-center text-xs pb-4 italic" style={{ color: '#a8a29e' }}>&ldquo;{getDailyQuote()}&rdquo;</p>
          </>
        )}
      </div>
    </main>
  );
}
