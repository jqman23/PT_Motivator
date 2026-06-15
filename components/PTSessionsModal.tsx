'use client';

import { useState } from 'react';

type PTSession = {
  date: string;
  note?: string;
};

interface Props {
  sessions: PTSession[];
  onChange: (sessions: PTSession[]) => void;
  onClose: () => void;
  today: string;
}

function formatDate(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function PTSessionsModal({ sessions, onChange, onClose, today }: Props) {
  const [inputDate, setInputDate] = useState(today);

  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  const add = (date: string) => {
    if (!sessions.some(s => s.date === date)) {
      onChange([...sessions, { date, note: '' }]);
    }
  };

  const remove = (date: string) => onChange(sessions.filter(s => s.date !== date));

  const updateNote = (date: string, note: string) => {
    onChange(sessions.map(s => s.date === date ? { ...s, note } : s));
  };

  const todayMarked = sessions.some(s => s.date === today);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '85dvh' }}
      >
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">PT Sessions</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">Track your physical therapy appointments</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 border-b border-stone-100 flex-shrink-0 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Add session</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={inputDate}
              max={today}
              onChange={e => setInputDate(e.target.value)}
              className="flex-1 text-sm border border-stone-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-200"
              style={{ colorScheme: 'light' }}
            />
            <button
              onClick={() => add(inputDate)}
              disabled={sessions.some(s => s.date === inputDate)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ background: '#D9A94B' }}
            >
              Add
            </button>
          </div>
          <button
            onClick={() => add(today)}
            disabled={todayMarked}
            className="w-full py-2.5 text-xs font-semibold rounded-xl border-2 border-dashed transition-opacity disabled:opacity-40"
            style={{ borderColor: '#D9A94B', color: '#D9A94B' }}
          >
            {todayMarked ? '✓ Today is already marked as a PT session' : '+ Mark today as PT session'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {sorted.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2">
              <p className="text-xs text-stone-400 italic text-center">No PT sessions logged yet.<br />Add your first one above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(session => (
                <div key={session.date} className="px-3 py-2.5 rounded-xl bg-stone-50">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-700 truncate">{formatDate(session.date)}</p>
                      {session.date === today && (
                        <p className="text-[10px] font-medium" style={{ color: '#D9A94B' }}>Today</p>
                      )}
                    </div>
                    <button
                      onClick={() => remove(session.date)}
                      className="w-6 h-6 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-400 flex-shrink-0 transition-colors"
                    >
                      ×
                    </button>
                  </div>

                  <textarea
                    value={session.note ?? ''}
                    onChange={e => updateNote(session.date, e.target.value)}
                    placeholder="PT visit note…"
                    rows={2}
                    className="mt-2 w-full text-xs resize-none rounded-lg border px-2.5 py-2 focus:outline-none focus:ring-1"
                    style={{
                      color: '#44403c',
                      borderColor: '#e7e5e4',
                      background: '#ffffff',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {sorted.length > 0 && (
          <div className="px-5 py-3 border-t border-stone-100 flex-shrink-0">
            <p className="text-[10px] text-stone-400 text-center">{sorted.length} session{sorted.length !== 1 ? 's' : ''} tracked</p>
          </div>
        )}
      </div>
    </div>
  );
}
