'use client';

import { useState, useEffect } from 'react';

interface Props {
  exerciseName: string;
  date: string;
  initialNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
}

export default function NotesModal({ exerciseName, date, initialNote, onSave, onClose }: Props) {
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSave = () => {
    onSave(note);
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
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-800 text-sm">{exerciseName}</h3>
            <p className="text-xs text-stone-400 mt-0.5">Note for {displayDate}</p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How did it feel? Any pain, improvements, modifications..."
            className="w-full h-32 text-sm text-stone-700 placeholder-stone-300 border border-stone-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-stone-300"
          />
        </div>

        <div className="px-4 pb-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm font-medium text-white rounded-xl transition-colors"
            style={{ background: '#7E9B86' }}
          >
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}
