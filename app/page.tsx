'use client';

import { useState, useEffect, useCallback } from 'react';
import { EXERCISES } from '@/lib/exercises';
import ExerciseCard from '@/components/ExerciseCard';
import WeekTracker from '@/components/WeekTracker';
import HealthTracker from '@/components/HealthTracker';
import CalendarModal from '@/components/CalendarModal';
import TimerWidget from '@/components/TimerWidget';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;

function dateStr(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function todayStr(): string {
  return dateStr(new Date());
}

function offsetDate(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

function displayForDate(ds: string): string {
  const today = todayStr();
  const yesterday = offsetDate(today, -1);
  if (ds === today) return 'Today';
  if (ds === yesterday) return 'Yesterday';
  return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  });
}

export default function Home() {
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [log, setLog] = useState<LogMap>({});
  const [notes, setNotes] = useState<NotesMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const weekStart = offsetDate(today, -6);

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/log?start=${weekStart}&end=${today}`);
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
    } catch (err) {
      console.error(err);
    }
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
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLog(), loadNotes(selectedDate)]).finally(() => setLoading(false));
  }, [loadLog, loadNotes, selectedDate]);

  const handleDateChange = (dir: -1 | 1) => {
    const next = offsetDate(selectedDate, dir);
    if (next > today) return;
    setSelectedDate(next);
    setNotes({});
  };

  const handleToggle = async (exerciseId: string) => {
    const current = log[selectedDate]?.[exerciseId] ?? false;
    const next = !current;
    setLog((prev) => ({
      ...prev,
      [selectedDate]: { ...(prev[selectedDate] || {}), [exerciseId]: next },
    }));
    setSaving(true);
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, exerciseId, completed: next }),
      });
    } catch {
      setLog((prev) => ({
        ...prev,
        [selectedDate]: { ...(prev[selectedDate] || {}), [exerciseId]: current },
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleNoteSave = async (exerciseId: string, note: string) => {
    setNotes((prev) => ({ ...prev, [exerciseId]: note }));
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, exerciseId, note }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const dayLog = log[selectedDate] || {};
  const mobilityExercises = EXERCISES.filter((e) => e.cat === 'mobility');
  const strengthExercises = EXERCISES.filter((e) => e.cat === 'strength');
  const mobilityDone = mobilityExercises.filter((e) => dayLog[e.id]).length;
  const strengthRequired = strengthExercises.filter((e) => !e.optional);
  const strengthDone = strengthRequired.filter((e) => dayLog[e.id]).length;
  const isToday = selectedDate === today;

  return (
    <main className="min-h-screen bg-[#F6F1E7] py-8 px-4">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-3xl font-semibold text-stone-800">Ankle PT</h1>
            <div className="flex items-center gap-2">
              <TimerWidget />
              <button
                onClick={() => setShowCalendar(true)}
                className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 transition-colors shadow-sm"
                title="View calendar"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <rect x="2" y="3" width="16" height="16" rx="2"/>
                  <path d="M2 8h16"/>
                  <path d="M6 1v4M14 1v4"/>
                  <rect x="5.5" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                  <rect x="9" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                  <rect x="12.5" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Date navigator */}
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => handleDateChange(-1)}
              className="w-8 h-8 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 transition-colors"
            >
              ‹
            </button>
            <div className="flex-1 text-center">
              <span className="text-sm font-semibold text-stone-700">{displayForDate(selectedDate)}</span>
              {!isToday && (
                <span className="text-xs text-stone-400 ml-2">{selectedDate}</span>
              )}
            </div>
            <button
              onClick={() => handleDateChange(1)}
              disabled={isToday}
              className="w-8 h-8 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>

          {saving && <p className="text-xs text-[#7E9B86] mt-2 text-center animate-pulse">Saving…</p>}
        </div>

        {showCalendar && (
          <CalendarModal
            today={today}
            selectedDate={selectedDate}
            onSelectDate={(d) => { setSelectedDate(d); setNotes({}); }}
            onClose={() => setShowCalendar(false)}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-[#7E9B86] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Mobility */}
            <section className="mb-5">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-serif text-lg font-semibold text-stone-800">Daily mobility &amp; balance</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400">{mobilityDone}/{mobilityExercises.length}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide bg-[#E4ECE6] text-[#7E9B86] px-2.5 py-1 rounded-full">
                    Most days
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {mobilityExercises.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    done={dayLog[ex.id] ?? false}
                    note={notes[ex.id] ?? ''}
                    today={selectedDate}
                    onToggle={() => handleToggle(ex.id)}
                    onNoteSave={(note) => handleNoteSave(ex.id, note)}
                  />
                ))}
              </div>
            </section>

            {/* Strength */}
            <section className="mb-5">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-serif text-lg font-semibold text-stone-800">Strength day</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400">{strengthDone}/{strengthRequired.length}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide bg-[#F4E3D6] text-[#C17B4F] px-2.5 py-1 rounded-full">
                    ~3× / week
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {strengthExercises.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    done={dayLog[ex.id] ?? false}
                    note={notes[ex.id] ?? ''}
                    today={selectedDate}
                    onToggle={() => handleToggle(ex.id)}
                    onNoteSave={(note) => handleNoteSave(ex.id, note)}
                  />
                ))}
              </div>
            </section>

            {/* Health */}
            <section className="mb-5">
              <HealthTracker today={selectedDate} />
            </section>

            {/* Week tracker */}
            <section className="mb-5">
              <WeekTracker log={log} today={today} selectedDate={selectedDate} />
            </section>

            <p className="text-center text-xs text-stone-400 pb-4">
              Tap a card to check off · ✏️ note · ▶ video demo
            </p>
          </>
        )}
      </div>
    </main>
  );
}
