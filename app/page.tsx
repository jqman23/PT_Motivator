'use client';

import { useState, useEffect, useCallback } from 'react';
import { EXERCISES } from '@/lib/exercises';
import ExerciseCard from '@/components/ExerciseCard';
import WeekTracker from '@/components/WeekTracker';
import HealthTracker from '@/components/HealthTracker';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;

function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function startOfWeekStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export default function Home() {
  const today = todayStr();
  const [log, setLog] = useState<LogMap>({});
  const [notes, setNotes] = useState<NotesMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const displayDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logRes, notesRes] = await Promise.all([
        fetch(`/api/log?start=${startOfWeekStr()}&end=${today}`),
        fetch(`/api/notes?date=${today}`),
      ]);

      if (logRes.ok) {
        const { rows } = await logRes.json();
        const newLog: LogMap = {};
        for (const row of rows) {
          const dateKey = (row.date as string).split('T')[0];
          if (!newLog[dateKey]) newLog[dateKey] = {};
          newLog[dateKey][row.exercise_id] = row.completed;
        }
        setLog(newLog);
      }

      if (notesRes.ok) {
        const { rows } = await notesRes.json();
        const newNotes: NotesMap = {};
        for (const row of rows) {
          newNotes[row.exercise_id] = row.note;
        }
        setNotes(newNotes);
      }
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (exerciseId: string) => {
    const current = log[today]?.[exerciseId] ?? false;
    const next = !current;

    setLog((prev) => ({
      ...prev,
      [today]: { ...(prev[today] || {}), [exerciseId]: next },
    }));

    setSaving(true);
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, exerciseId, completed: next }),
      });
    } catch (err) {
      console.error('Failed to save log', err);
      setLog((prev) => ({
        ...prev,
        [today]: { ...(prev[today] || {}), [exerciseId]: current },
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
        body: JSON.stringify({ date: today, exerciseId, note }),
      });
    } catch (err) {
      console.error('Failed to save note', err);
    }
  };

  const todayLog = log[today] || {};
  const mobilityExercises = EXERCISES.filter((e) => e.cat === 'mobility');
  const strengthExercises = EXERCISES.filter((e) => e.cat === 'strength');
  const mobilityDone = mobilityExercises.filter((e) => todayLog[e.id]).length;
  const strengthRequired = strengthExercises.filter((e) => !e.optional);
  const strengthDone = strengthRequired.filter((e) => todayLog[e.id]).length;

  return (
    <main className="min-h-screen bg-[#F6F1E7] py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-semibold text-stone-800">Ankle PT</h1>
          <p className="text-sm text-stone-400 mt-1">{displayDate}</p>
          {saving && <p className="text-xs text-sage mt-1 animate-pulse">Saving…</p>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-sage border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <section className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-serif text-lg font-semibold text-stone-800">
                  Daily mobility &amp; balance
                </h2>
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
                    done={todayLog[ex.id] ?? false}
                    note={notes[ex.id] ?? ''}
                    today={today}
                    onToggle={() => handleToggle(ex.id)}
                    onNoteSave={(note) => handleNoteSave(ex.id, note)}
                  />
                ))}
              </div>
            </section>

            <section className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-serif text-lg font-semibold text-stone-800">
                  Strength day
                </h2>
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
                    done={todayLog[ex.id] ?? false}
                    note={notes[ex.id] ?? ''}
                    today={today}
                    onToggle={() => handleToggle(ex.id)}
                    onNoteSave={(note) => handleNoteSave(ex.id, note)}
                  />
                ))}
              </div>
            </section>

            <section className="mb-6">
              <HealthTracker today={today} />
            </section>

            <section className="mb-6">
              <WeekTracker log={log} today={today} />
            </section>

            <p className="text-center text-xs text-stone-400">
              Tap a card to check it off · ✏️ to add a note · ▶︎ for a video demo
            </p>
          </>
        )}
      </div>
    </main>
  );
}
