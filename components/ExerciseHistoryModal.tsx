'use client';

import { useEffect, useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';

type HistoryRow = {
  date: string;
  completed: boolean;
  note: string;
  sets_count?: number | string | null;
  reps_count?: number | string | null;
  duration_seconds?: number | string | null;
  weight_value?: number | string | null;
  weight_unit?: string | null;
  scope_multiplier?: number | string | null;
};

type ClarificationOption = { label?: string; value?: string } | string;

type CleanupResult = {
  originalNote: string;
  standardizedNote: string;
  fields?: Record<string, string>;
  summary?: string[];
  questions?: string[];
  clarificationOptions?: Array<{ label?: string; value?: string }>;
  error?: string;
  detail?: string;
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

function optionLabel(option: ClarificationOption) {
  return typeof option === 'string' ? option : String(option.label ?? option.value ?? '').trim();
}

function optionValue(option: ClarificationOption) {
  return typeof option === 'string' ? option : String(option.value ?? option.label ?? '').trim();
}

function metricSummary(row: HistoryRow) {
  const sets = Number(row.sets_count || 0);
  const reps = Number(row.reps_count || 0);
  const seconds = Number(row.duration_seconds || 0);
  if (!sets) return '';
  const amount = reps || (seconds >= 60 && seconds % 60 === 0 ? seconds / 60 : seconds);
  const unit = reps ? 'reps' : seconds >= 60 && seconds % 60 === 0 ? (amount === 1 ? 'min' : 'mins') : (amount === 1 ? 'sec' : 'secs');
  return `${sets} × ${amount} ${unit}`;
}

function weightSummary(row: HistoryRow) {
  const weight = Number(row.weight_value);
  if (!Number.isFinite(weight) || weight <= 0) return '';
  return `${weight} ${row.weight_unit === 'kg' ? 'kg' : 'lb'}`;
}

async function readJson(res: Response) {
  const raw = await res.text();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { return { error: 'Non-JSON response', detail: raw.slice(0, 800) }; }
}

export default function ExerciseHistoryModal({ exercise, onClose }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cleanupRow, setCleanupRow] = useState<HistoryRow | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [cleanupNote, setCleanupNote] = useState('');
  const [cleanupAnswer, setCleanupAnswer] = useState('');
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupSaving, setCleanupSaving] = useState(false);
  const [cleanupError, setCleanupError] = useState('');

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
          ...row,
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

  const startCleanup = async (row: HistoryRow, clarification = '') => {
    setCleanupRow(row);
    setCleanupLoading(true);
    setCleanupError('');
    setCleanupAnswer('');
    try {
      const res = await fetch('/api/standardize-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cleanupMode: true,
          rawNote: row.note,
          clarification,
          previousStandardizedNote: cleanupNote,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          exerciseSets: exercise.sets ?? '',
          exerciseCue: exercise.cue ?? '',
          exerciseTips: exercise.tips ?? [],
          recentNotes: rows.filter(item => item.note && item.date !== row.date).slice(0, 8).map(item => item.note),
          dailyMetric: {
            sets: row.sets_count,
            reps: row.reps_count,
            durationSeconds: row.duration_seconds,
            weight: row.weight_value,
            weightUnit: row.weight_unit,
            scopeMultiplier: row.scope_multiplier,
          },
        }),
      });
      const data = await readJson(res) as CleanupResult;
      if (!res.ok) {
        setCleanupError([data.error, data.detail].filter(Boolean).join(': ') || 'Cleanup failed.');
      }
      const nextResult = {
        originalNote: row.note,
        standardizedNote: data.standardizedNote || row.note,
        fields: data.fields ?? {},
        summary: data.summary ?? [],
        questions: data.questions ?? [],
        clarificationOptions: data.clarificationOptions ?? [],
      };
      setCleanupResult(nextResult);
      setCleanupNote(nextResult.standardizedNote);
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : 'Cleanup failed.');
      setCleanupResult({ originalNote: row.note, standardizedNote: row.note, fields: {}, questions: [], clarificationOptions: [] });
      setCleanupNote(row.note);
    } finally {
      setCleanupLoading(false);
    }
  };

  const applyOption = (option: ClarificationOption) => {
    if (!cleanupRow) return;
    const value = optionValue(option);
    if (!value) return;
    void startCleanup(cleanupRow, value);
  };

  const rerunWithAnswer = () => {
    if (!cleanupRow || !cleanupAnswer.trim()) return;
    void startCleanup(cleanupRow, cleanupAnswer.trim());
  };

  const saveCleanup = async () => {
    if (!cleanupRow) return;
    setCleanupSaving(true);
    setCleanupError('');
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: cleanupRow.date, exerciseId: exercise.id, note: cleanupNote.trim() }),
      });
      if (!res.ok) throw new Error('Could not save cleaned note.');
      setRows(prev => prev.map(row => row.date === cleanupRow.date ? { ...row, note: cleanupNote.trim() } : row));
      setCleanupRow(null);
      setCleanupResult(null);
      setCleanupNote('');
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : 'Could not save cleaned note.');
    } finally {
      setCleanupSaving(false);
    }
  };

  const fieldChips = cleanupResult?.fields
    ? Object.values(cleanupResult.fields).filter(Boolean)
    : [];

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
            Tap a day to jump there. Weight and other saved metrics appear beside each entry.
          </p>
        </div>

        <div className="overflow-y-auto px-4 pb-4 flex-1">
          {cleanupRow && (
            <div className="mb-3 rounded-2xl border bg-white p-3" style={{ borderColor: '#cfded3' }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#476653' }}>Cleanup note</p>
                  <p className="text-xs text-stone-500">{displayDate(cleanupRow.date)}</p>
                </div>
                <button
                  onClick={() => { setCleanupRow(null); setCleanupResult(null); setCleanupNote(''); setCleanupError(''); }}
                  className="text-xs text-stone-400 px-2 py-1"
                >
                  Close
                </button>
              </div>

              {cleanupLoading ? (
                <div className="flex items-center gap-2 text-xs text-stone-500 py-3">
                  <div className="w-4 h-4 border-2 border-[#7E9B86] border-t-transparent rounded-full animate-spin" />
                  Cleaning up…
                </div>
              ) : cleanupResult && (
                <div className="space-y-3">
                  {cleanupError && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{cleanupError}</p>}

                  <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Original</p>
                    <p className="text-xs text-stone-600 leading-snug">{cleanupResult.originalNote}</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#476653' }}>Cleaned</p>
                    <textarea
                      value={cleanupNote}
                      onChange={e => setCleanupNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm resize-none focus:outline-none"
                      style={{ fontSize: 16, colorScheme: 'light' }}
                    />
                    {fieldChips.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {fieldChips.map((chip, index) => (
                          <span key={`${chip}-${index}`} className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: '#E4ECE6', color: '#476653' }}>{chip}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {!!cleanupResult.questions?.length && (
                    <div className="rounded-xl bg-[#FBF5E8] border border-amber-100 p-3">
                      <p className="text-xs font-bold text-amber-800 mb-2">AI could use one clarification</p>
                      <p className="text-xs text-amber-700 mb-2">{cleanupResult.questions[0]}</p>
                      {!!cleanupResult.clarificationOptions?.length && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {cleanupResult.clarificationOptions.map((option, index) => (
                            <button
                              key={`${optionLabel(option)}-${index}`}
                              onClick={() => applyOption(option)}
                              className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-white border border-amber-200 text-amber-800"
                            >
                              {optionLabel(option)}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <input
                          value={cleanupAnswer}
                          onChange={e => setCleanupAnswer(e.target.value)}
                          placeholder="Or type answer…"
                          className="min-w-0 flex-1 rounded-lg border border-amber-200 px-2 py-1.5 text-xs"
                          style={{ fontSize: 16, colorScheme: 'light' }}
                        />
                        <button
                          onClick={rerunWithAnswer}
                          disabled={!cleanupAnswer.trim() || cleanupLoading}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                          style={{ background: '#D9A94B' }}
                        >
                          Use
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => { setCleanupRow(null); setCleanupResult(null); setCleanupNote(''); }}
                      className="px-3 py-2 text-xs font-semibold text-stone-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveCleanup}
                      disabled={cleanupSaving}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                      style={{ background: '#7E9B86' }}
                    >
                      {cleanupSaving ? 'Saving…' : 'Save cleaned'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                <div
                  key={row.date}
                  className="w-full bg-white rounded-2xl border border-stone-100 px-3 py-3 hover:bg-stone-50 transition-colors"
                >
                  <button
                    onClick={() => jumpToDate(row.date)}
                    className="w-full text-left"
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-800">{displayDate(row.date)}</p>
                        <p className="text-[11px] text-stone-400">{row.date}</p>
                        {(metricSummary(row) || weightSummary(row)) && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {metricSummary(row) && <span className="rounded-full bg-[#E4ECE6] px-2 py-0.5 text-[10px] font-bold text-[#476653]">{metricSummary(row)}</span>}
                            {weightSummary(row) && <span className="rounded-full bg-[#FBF5E8] px-2 py-0.5 text-[10px] font-bold text-[#A97920]">{weightSummary(row)}</span>}
                          </div>
                        )}
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
                  {row.note && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); void startCleanup(row); }}
                        className="text-[11px] font-bold px-2.5 py-1.5 rounded-full"
                        style={{ background: '#E4ECE6', color: '#476653', touchAction: 'manipulation' }}
                      >
                        Clean up
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
