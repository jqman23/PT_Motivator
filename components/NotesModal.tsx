'use client';

import { useState, useEffect } from 'react';

interface Props {
  exerciseName: string;
  exerciseId: string;
  date: string;
  initialNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
}

export default function NotesModal({
  exerciseName,
  exerciseId,
  date,
  initialNote,
  onSave,
  onClose,
}: Props) {
  const [note, setNote] = useState(initialNote);
  const [loadingStoredNote, setLoadingStoredNote] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Always re-check the stored note when the modal opens. The parent notes map can
  // be stale after adding exercises or switching dates, so the modal should trust DB.
  useEffect(() => {
    let cancelled = false;
    setNote(initialNote ?? '');
    setLoadingStoredNote(true);

    fetch(`/api/notes?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const stored = rows.find((row: { exercise_id?: string }) => row.exercise_id === exerciseId);
        setNote(typeof stored?.note === 'string' ? stored.note : '');
      })
      .catch(() => {/* silent */})
      .finally(() => {
        if (!cancelled) setLoadingStoredNote(false);
      });

    return () => { cancelled = true; };
  }, [exerciseId, date, initialNote]);

  // Fetch recent notes from the past 3 days
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

  const handleSave = () => {
    onSave(note.trim());
    onClose();
  };

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

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
        {/* Header */}
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
          {/* Suggestion chips from recent notes */}
          {suggestions.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                Recent notes — tap to use
              </p>
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              >
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNote(s); }}
                    className="flex-shrink-0 text-xs px-3 py-2 rounded-full border transition-colors text-left"
                    style={{
                      borderColor: note === s ? '#7E9B86' : '#e7e5e4',
                      background: note === s ? '#E4ECE6' : '#fafaf9',
                      color: note === s ? '#7E9B86' : '#57534e',
                      maxWidth: 200,
                      touchAction: 'manipulation',
                    }}
                  >
                    <span
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      } as React.CSSProperties}
                    >{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Text area */}
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How did it feel? Any pain, improvements, modifications..."
            className="w-full h-32 text-sm text-stone-700 placeholder-stone-300 border border-stone-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2"
            style={{ fontSize: 16, colorScheme: 'light' }}
            onFocus={(e) => e.currentTarget.style.outlineColor = '#7E9B86'}
          />
        </div>

        <div className="px-4 pb-4 flex gap-2 justify-end">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="px-4 py-2 text-sm text-stone-500"
            style={{ touchAction: 'manipulation' }}
          >
            Cancel
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSave(); }}
            className="px-5 py-2 text-sm font-medium text-white rounded-xl"
            style={{ background: '#7E9B86', touchAction: 'manipulation' }}
          >
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}
