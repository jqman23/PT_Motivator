'use client';

import { useEffect, useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';

type HistoryRow = {
  date: string;
  completed: boolean;
  note: string;
};

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

function displayDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ExerciseHistoryModal({ exercise, onClose }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`/api/exercise-history?exerciseId=${encodeURIComponent(exercise.id)}&limit=180`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (!Array.isArray(data.rows)) {
          setRows([]);
          setError(data.error || 'Could not load history.');
          return;
        }
        setRows(data.rows.map((row: HistoryRow) => ({
          date: String(row.date).split('T')[0],
          completed: !!row.completed,
          note: row.note ?? '',
        })));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load history.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [exercise.id]);

  const stats = useMemo(() => {
    const completed = rows.filter(row => row.completed).length;
    const notes = rows.filter(row => row.note.trim()).length;
    return { completed, notes };
  }, [rows]);

  const jumpToDate = (date: string) => {
    localStorage.setItem('pt-selected-date', date);
    window.location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8"
      onClick={onClose}
    >
      <div
        className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90dvh' }}
      >
        <div className="px-4 py-3 border-b border-stone-200 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Exercise history</p>
            <h2 className="font-serif text-lg font-semibold text-stone-800 leading-tight truncate">{exercise.name}</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">
              {rows.length ? `${stats.completed} completed · ${stats.notes} note days · last ${rows.length} tracked days` : 'Tap a day below to jump there'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl flex-shrink-0">×</button>
        </div>

        <div className="px-4 py-3 flex-shrink-0">
          <p className="text-xs text-stone-500 rounded-xl bg-white border border-stone-100 px-3 py-2">
            Open from an exercise by right-clicking on desktop or long-pressing on mobile. Tap any row to go to that day.
          </p>
        </div>

        <div className="overflow-y-auto px-4 pb-4 flex-1">
          {loading && (
            <div className="flex items-center justify-center h-28">
              <div className="w-6 h-6 border-2 border-[#7E9B86] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-3">{error}</p>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-stone-400 italic text-center py-10">No saved log or notes yet for this exercise.</p>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="space-y-2">
              {rows.map(row => (
                <button
                  key={row.date}
                  onClick={() => jumpToDate(row.date)}
                  className="w-full text-left bg-white rounded-2xl border border-stone-100 px-3 py-3 hover:bg-stone-50 transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800">{displayDate(row.date)}</p>
                      <p className="text-[11px] text-stone-400">{row.date}</p>
                    </div>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full flex-shrink-0"
                      style={{
                        color: row.completed ? '#7E9B86' : '#a8a29e',
                        background: row.completed ? '#E4ECE6' : '#f5f5f4',
                      }}
                    >
                      {row.completed ? 'Done' : 'Not done'}
                    </span>
                  </div>
                  {row.note && <p className="text-xs text-stone-500 mt-2 italic leading-snug">📝 {row.note}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
