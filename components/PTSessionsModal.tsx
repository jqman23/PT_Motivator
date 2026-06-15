'use client';

import { useState } from 'react';

interface Props {
  sessions: string[];
  onChange: (sessions: string[]) => void;
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

  const sorted = [...sessions].sort((a, b) => b.localeCompare(a));

  const add = (date: string) => {
    if (!sessions.includes(date)) onChange([...sessions, date]);
  };

  const remove = (date: string) => onChange(sessions.filter(d => d !== date));

  const todayMarked = sessions.includes(today);

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
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">PT Sessions</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">Track your physical therapy appointments</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Add controls */}
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
              disabled={sessions.includes(inputDate)}
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

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {sorted.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#FBF5E8' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="#D9A94B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="10" cy="7" r="3" />
                  <path d="M3 19v-2a7 7 0 0114 0v2" />
                  <path d="M15 4v5M12.5 6.5h5" />
                </svg>
              </div>
              <p className="text-xs text-stone-400 italic text-center">No PT sessions logged yet.<br />Add your first one above.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sorted.map(date => (
                <div key={date} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-stone-50">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: '#FBF5E8' }}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="#D9A94B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <circle cx="9" cy="6" r="2.5" />
                      <path d="M2 18v-1.5a6 6 0 0112 0V18" />
                      <path d="M15 4v5M12.5 6.5h5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-700 truncate">{formatDate(date)}</p>
                    {date === today && (
                      <p className="text-[10px] font-medium" style={{ color: '#D9A94B' }}>Today</p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(date)}
                    className="w-6 h-6 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-400 flex-shrink-0 transition-colors"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
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
