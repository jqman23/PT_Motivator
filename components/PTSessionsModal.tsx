'use client';

import { useState } from 'react';
import SecretTextarea from './SecretTextarea';

type PTSessionKind = 'pt' | 'training';

type PTSession = {
  date: string;
  kind?: PTSessionKind;
  note?: string;
};

interface Props {
  sessions: PTSession[];
  onChange: (sessions: PTSession[]) => void;
  onClose: () => void;
  today: string;
}

const SESSION_KINDS: PTSessionKind[] = ['pt', 'training'];

function formatDate(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function normalizeKind(kind?: PTSession['kind']): PTSessionKind {
  return kind === 'training' ? 'training' : 'pt';
}

function kindLabel(kind?: PTSession['kind']) {
  return normalizeKind(kind) === 'training' ? 'Training' : 'PT';
}

function kindStyle(kind?: PTSession['kind']) {
  return normalizeKind(kind) === 'training'
    ? { background: '#eef2ff', color: '#4f46e5' }
    : { background: '#FBF5E8', color: '#D9A94B' };
}

function sessionKey(session: PTSession) {
  return `${session.date}-${normalizeKind(session.kind)}`;
}

export default function PTSessionsModal({ sessions, onChange, onClose, today }: Props) {
  const [inputDate, setInputDate] = useState(today);
  const [inputKinds, setInputKinds] = useState<PTSessionKind[]>(['pt']);

  const sorted = [...sessions].sort((a, b) => {
    const dateSort = b.date.localeCompare(a.date);
    if (dateSort !== 0) return dateSort;
    return SESSION_KINDS.indexOf(normalizeKind(a.kind)) - SESSION_KINDS.indexOf(normalizeKind(b.kind));
  });

  const grouped = sorted.reduce<Array<{ date: string; sessions: PTSession[] }>>((groups, session) => {
    const current = groups[groups.length - 1];
    if (current?.date === session.date) current.sessions.push(session);
    else groups.push({ date: session.date, sessions: [session] });
    return groups;
  }, []);

  const hasSession = (date: string, kind: PTSessionKind) =>
    sessions.some(s => s.date === date && normalizeKind(s.kind) === kind);

  const canAdd = (date: string) =>
    Boolean(date) && inputKinds.some(kind => !hasSession(date, kind));

  const add = (date: string) => {
    const additions = inputKinds
      .filter(kind => !hasSession(date, kind))
      .map(kind => ({ date, kind, note: '' }));

    if (additions.length > 0) onChange([...sessions, ...additions]);
  };

  const remove = (date: string, kind: PTSessionKind) =>
    onChange(sessions.filter(s => !(s.date === date && normalizeKind(s.kind) === kind)));

  const updateNote = (date: string, kind: PTSessionKind, note: string) => {
    onChange(sessions.map(s => s.date === date && normalizeKind(s.kind) === kind ? { ...s, kind, note } : s));
  };

  const toggleInputKind = (kind: PTSessionKind) => {
    setInputKinds(prev => prev.includes(kind) ? prev.filter(item => item !== kind) : [...prev, kind]);
  };

  const todayAddable = canAdd(today);
  const selectedLabel = inputKinds.length === 2 ? 'PT + training sessions' : inputKinds.includes('training') ? 'training session' : 'PT session';

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
            <p className="text-[11px] text-stone-400 mt-0.5">Track PT appointments and training sessions</p>
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
          <div className="grid grid-cols-2 gap-2">
            {SESSION_KINDS.map(kind => {
              const selected = inputKinds.includes(kind);
              return (
                <button
                  key={kind}
                  onClick={() => toggleInputKind(kind)}
                  className="rounded-xl px-3 py-2 text-xs font-bold border"
                  style={selected ? { ...kindStyle(kind), borderColor: 'transparent' } : { background: '#fff', color: '#78716c', borderColor: '#e7e5e4' }}
                >
                  {selected ? '✓ ' : ''}{kindLabel(kind)}
                </button>
              );
            })}
          </div>
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
              disabled={!canAdd(inputDate)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ background: '#D9A94B' }}
            >
              Add
            </button>
          </div>
          <button
            onClick={() => add(today)}
            disabled={!todayAddable}
            className="w-full py-2.5 text-xs font-semibold rounded-xl border-2 border-dashed transition-opacity disabled:opacity-40"
            style={{ borderColor: '#D9A94B', color: '#D9A94B' }}
          >
            {todayAddable ? `+ Mark today as ${selectedLabel}` : `✓ Selected session${inputKinds.length === 1 ? '' : 's'} already marked today`}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {sorted.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2">
              <p className="text-xs text-stone-400 italic text-center">No PT or training sessions logged yet.<br />Add your first one above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(group => (
                <div key={group.date} className="rounded-2xl bg-stone-50 border border-stone-100 overflow-hidden">
                  <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-stone-100 bg-white/60">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-700 truncate">{formatDate(group.date)}</p>
                      {group.date === today && <p className="text-[10px] font-medium" style={{ color: '#D9A94B' }}>Today</p>}
                    </div>
                    {group.sessions.length > 1 && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400 flex-shrink-0">{group.sessions.length} sessions</span>
                    )}
                  </div>

                  <div className="divide-y divide-stone-100">
                    {group.sessions.map(session => {
                      const kind = normalizeKind(session.kind);
                      return (
                        <div key={sessionKey(session)} className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <span
                              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={kindStyle(kind)}
                            >
                              {kindLabel(kind)}
                            </span>
                            <div className="flex-1" />
                            <button
                              onClick={() => remove(session.date, kind)}
                              className="w-6 h-6 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-400 flex-shrink-0 transition-colors"
                            >
                              ×
                            </button>
                          </div>

                          <SecretTextarea
                            value={session.note ?? ''}
                            onChange={value => updateNote(session.date, kind, value)}
                            placeholder={`${kindLabel(kind)} note…`}
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
                      );
                    })}
                  </div>
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
