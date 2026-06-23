'use client';

import { useState, useEffect } from 'react';

interface Props {
  exerciseName: string;
  exerciseId: string;
  date: string;
  initialNote: string;
  exerciseSets?: string;
  exerciseCue?: string;
  exerciseTips?: string[];
  onSave: (note: string) => void;
  onClose: () => void;
}

type StandardizedFields = {
  dose?: string;
  target?: string;
  variation?: string;
  modifier?: string;
  outcome?: string;
};

type StandardizeResult = {
  originalNote: string;
  standardizedNote: string;
  fields?: StandardizedFields;
  summary?: string[];
  changed?: boolean;
  error?: string;
  detail?: string;
};

function cleanLines(value?: string[]) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, 6) : [];
}

function preserveTypedNote(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

async function readJson(res: Response) {
  const raw = await res.text();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { return { error: 'Non-JSON response', detail: raw.slice(0, 800) }; }
}

export default function NotesModal({
  exerciseName,
  exerciseId,
  date,
  initialNote,
  exerciseSets = '',
  exerciseCue = '',
  exerciseTips = [],
  onSave,
  onClose,
}: Props) {
  const [note, setNote] = useState(initialNote);
  const [loadingStoredNote, setLoadingStoredNote] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [standardizing, setStandardizing] = useState(false);
  const [standardizeError, setStandardizeError] = useState('');
  const [review, setReview] = useState<StandardizeResult | null>(null);
  const [standardizedNote, setStandardizedNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fallbackNote = initialNote ?? '';
    setNote(fallbackNote);
    setReview(null);
    setStandardizedNote('');
    setStandardizeError('');
    setLoadingStoredNote(true);

    fetch(`/api/notes?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const stored = rows.find((row: { exercise_id?: string }) => row.exercise_id === exerciseId);
        if (typeof stored?.note === 'string') {
          setNote(stored.note);
          return;
        }

        // Do not let a stale/missed server fetch erase a note the Home Screen already has.
        setNote(current => current || fallbackNote);
      })
      .catch(() => {
        if (!cancelled) setNote(current => current || fallbackNote);
      })
      .finally(() => {
        if (!cancelled) setLoadingStoredNote(false);
      });

    return () => { cancelled = true; };
  }, [exerciseId, date, initialNote]);

  useEffect(() => {
    fetch(`/api/recent-notes?exerciseId=${encodeURIComponent(exerciseId)}&beforeDate=${date}`)
      .then(r => r.json())
      .then(data => setSuggestions((data.notes ?? []).filter((n: string) => n.trim())))
      .catch(() => {/* silent */});
  }, [exerciseId, date]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  const saveAndClose = (value: string) => {
    onSave(preserveTypedNote(value));
    onClose();
  };

  const handleReview = async () => {
    const rawNote = preserveTypedNote(note);
    if (!rawNote) {
      saveAndClose('');
      return;
    }

    setStandardizeError('');
    setStandardizing(true);
    try {
      const res = await fetch('/api/standardize-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId,
          exerciseName,
          rawNote,
          exerciseSets,
          exerciseCue,
          exerciseTips: cleanLines(exerciseTips),
          recentNotes: suggestions,
        }),
      });
      const data = await readJson(res) as StandardizeResult;
      if (!res.ok) {
        const detail = [data.error, data.detail].filter(Boolean).join(': ');
        setStandardizeError(detail || 'Could not standardize note. You can still save the original.');
        setReview({ originalNote: rawNote, standardizedNote: data.standardizedNote || rawNote, fields: {}, changed: false });
        setStandardizedNote(data.standardizedNote || rawNote);
        return;
      }
      setReview(data);
      setStandardizedNote(data.standardizedNote || rawNote);
    } catch (err) {
      setStandardizeError(err instanceof Error ? err.message : 'Could not standardize note. You can still save the original.');
      setReview({ originalNote: rawNote, standardizedNote: rawNote, fields: {}, changed: false });
      setStandardizedNote(rawNote);
    } finally {
      setStandardizing(false);
    }
  };

  const useSuggestion = (value: string) => {
    setNote(value);
    setReview(null);
    setStandardizedNote('');
    setStandardizeError('');
  };

  const editOriginal = () => {
    setReview(null);
    setStandardizedNote('');
    setStandardizeError('');
  };

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const fields = review?.fields ?? {};
  const fieldChips = [fields.dose, fields.target, fields.variation, fields.modifier, fields.outcome].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-800 text-sm">{exerciseName}</h3>
            <p className="text-xs text-stone-400 mt-0.5">
              Note for {displayDate}{loadingStoredNote ? ' · loading stored note…' : ''}
            </p>
          </div>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="w-8 h-8 rounded-lg bg-stone-100 text-stone-400 flex items-center justify-center text-xl leading-none"
            style={{ touchAction: 'manipulation' }}
          >×</button>
        </div>

        <div className="p-4">
          {suggestions.length > 0 && !review && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                Past templates — tap to reuse/edit
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                {suggestions.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); useSuggestion(s); }}
                    className="flex-shrink-0 text-xs px-3 py-2 rounded-full border transition-colors text-left"
                    style={{
                      borderColor: note === s ? '#7E9B86' : '#e7e5e4',
                      background: note === s ? '#E4ECE6' : '#fafaf9',
                      color: note === s ? '#7E9B86' : '#57534e',
                      maxWidth: 220,
                      touchAction: 'manipulation',
                    }}
                  >
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!review ? (
            <>
              <textarea
                autoFocus
                value={note}
                onChange={(e) => { setNote(e.target.value); setStandardizeError(''); }}
                placeholder="Type anything. Use Save as-is to preserve it, or Review note for a one-line standardized version."
                className="w-full h-32 text-sm text-stone-700 placeholder-stone-300 border border-stone-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2"
                style={{ fontSize: 16, colorScheme: 'light' }}
                onFocus={(e) => e.currentTarget.style.outlineColor = '#7E9B86'}
              />
              <p className="mt-2 text-[11px] text-stone-400 leading-snug">
                Save as-is preserves your exact note and line breaks. Review note creates the one-line structured format.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              {standardizeError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {standardizeError}
                </div>
              )}

              <div className="rounded-2xl border border-stone-100 bg-stone-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Original</p>
                <p className="text-xs text-stone-600 leading-snug" style={{ whiteSpace: 'pre-wrap' }}>{review.originalNote}</p>
              </div>

              <div className="rounded-2xl border p-3" style={{ borderColor: '#cfded3', background: '#F8FBF8' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#476653' }}>Standardized</p>
                <textarea
                  value={standardizedNote}
                  onChange={(e) => setStandardizedNote(e.target.value)}
                  rows={3}
                  className="w-full text-sm resize-none rounded-xl border border-stone-200 px-3 py-2 focus:outline-none bg-white"
                  style={{ fontSize: 16, colorScheme: 'light' }}
                />
                {fieldChips.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {fieldChips.map((chip, i) => (
                      <span key={`${chip}-${i}`} className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: '#E4ECE6', color: '#476653' }}>{chip}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pb-4 flex flex-wrap gap-2 justify-end">
          {!review ? (
            <>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                className="px-4 py-2 text-sm text-stone-500"
                style={{ touchAction: 'manipulation' }}
              >
                Cancel
              </button>
              {note && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNote(''); setStandardizeError(''); setReview(null); }}
                  className="px-4 py-2 text-sm font-semibold rounded-xl text-red-500 bg-red-50"
                  style={{ touchAction: 'manipulation' }}
                >
                  Clear
                </button>
              )}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveAndClose(note); }}
                disabled={loadingStoredNote}
                className="px-4 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-50"
                style={{ background: '#7E9B86', touchAction: 'manipulation' }}
              >
                Save as-is
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleReview(); }}
                disabled={standardizing || loadingStoredNote}
                className="px-5 py-2 text-sm font-semibold rounded-xl bg-stone-100 text-stone-600 disabled:opacity-50"
                style={{ touchAction: 'manipulation' }}
              >
                {standardizing ? 'Standardizing…' : 'Review note'}
              </button>
            </>
          ) : (
            <>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editOriginal(); }}
                className="px-3 py-2 text-sm text-stone-500"
                style={{ touchAction: 'manipulation' }}
              >
                Edit original
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveAndClose(review.originalNote); }}
                className="px-3 py-2 text-sm font-semibold rounded-xl bg-stone-100 text-stone-500"
                style={{ touchAction: 'manipulation' }}
              >
                Keep original
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveAndClose(standardizedNote); }}
                className="px-4 py-2 text-sm font-bold text-white rounded-xl"
                style={{ background: '#7E9B86', touchAction: 'manipulation' }}
              >
                Save standardized
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
