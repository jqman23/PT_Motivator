'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig, makeCustomExercise } from '@/lib/layout';

interface Props {
  builtIns: Exercise[];
  customExercises: Exercise[];
  layout: CategoryConfig[];
  addToCatId?: string | null;
  onPick: (exId: string, catId: string) => void;
  onCreateCustom: (ex: Exercise) => void;
  onDeleteCustom: (exId: string) => void;
  onClose: () => void;
}

export default function LibraryModal({
  builtIns, customExercises, layout, addToCatId, onPick, onCreateCustom, onDeleteCustom, onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [cue, setCue] = useState('');
  const [sets, setSets] = useState('');
  const [cat, setCat] = useState<Exercise['cat']>('mobility');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const targetCat = addToCatId ? layout.find(c => c.id === addToCatId) : null;

  // exId -> category name (where it currently lives)
  const assignment = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of layout) for (const id of c.exerciseIds) m[id] = c.name;
    return m;
  }, [layout]);

  const all = useMemo(() => {
    const customIds = new Set(customExercises.map(e => e.id));
    return [...builtIns, ...customExercises].map(e => ({ ...e, isCustom: customIds.has(e.id) }));
  }, [builtIns, customExercises]);

  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter(e => e.name.toLowerCase().includes(q) || e.cue.toLowerCase().includes(q)) : all;

  const submitCreate = () => {
    if (!name.trim()) return;
    const ex = makeCustomExercise({ name, cue, sets, cat });
    onCreateCustom(ex);
    if (addToCatId) onPick(ex.id, addToCatId);
    setName(''); setCue(''); setSets(''); setCat('mobility'); setCreating(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8"
      onClick={onClose}
    >
      <div
        className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '92dvh' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-semibold text-stone-800 truncate">
              {targetCat ? `Add to ${targetCat.name}` : 'Exercise library'}
            </h2>
            <p className="text-[11px] text-stone-400">
              {targetCat ? 'Tap an exercise to add it' : 'Your master list of exercises'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl flex-shrink-0">×</button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 flex-shrink-0">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search exercises…"
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-stone-300"
            style={{ fontSize: 16, colorScheme: 'light' }}
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto px-3 py-3 flex-1">
          <div className="space-y-1.5">
            {filtered.map(e => {
              const inCatName = assignment[e.id];
              const inTarget = targetCat && targetCat.exerciseIds.includes(e.id);
              return (
                <div key={e.id} className="bg-white rounded-xl border border-stone-100 px-3 py-2 flex items-center gap-2">
                  <button
                    disabled={!addToCatId}
                    onClick={() => addToCatId && onPick(e.id, addToCatId)}
                    className="flex-1 min-w-0 text-left"
                    style={{ cursor: addToCatId ? 'pointer' : 'default' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-stone-800 truncate">{e.name}</span>
                      {e.isCustom && <span className="text-[9px] font-bold uppercase tracking-wide text-[#5B9BD5] bg-[#dbeafe] px-1.5 py-0.5 rounded">custom</span>}
                    </div>
                    {e.cue && <p className="text-[11px] text-stone-400 leading-snug truncate">{e.cue}</p>}
                    {inCatName && <p className="text-[10px] text-stone-400 mt-0.5">in {inCatName}</p>}
                  </button>

                  {addToCatId ? (
                    inTarget ? (
                      <span className="flex-shrink-0 text-[#7E9B86] text-sm font-bold">✓</span>
                    ) : (
                      <button onClick={() => onPick(e.id, addToCatId)}
                        className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#E4ECE6] text-[#7E9B86] flex items-center justify-center text-lg font-bold">＋</button>
                    )
                  ) : e.isCustom ? (
                    confirmDelete === e.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { onDeleteCustom(e.id); setConfirmDelete(null); }} className="text-[11px] font-bold px-2 py-1 rounded-lg text-white bg-red-500">Delete</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-[11px] font-semibold px-2 py-1 rounded-lg text-stone-500 bg-stone-100">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(e.id)}
                        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-stone-300 hover:bg-red-50 hover:text-red-500" title="Delete custom exercise">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5h7L12 4" />
                        </svg>
                      </button>
                    )
                  ) : null}
                </div>
              );
            })}
            {filtered.length === 0 && <p className="text-xs text-stone-400 italic text-center py-6">No exercises match “{query}”.</p>}
          </div>
        </div>

        {/* Create new */}
        <div className="px-3 py-3 border-t border-stone-200 flex-shrink-0">
          {creating ? (
            <div className="bg-white rounded-xl border border-stone-100 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">New exercise</p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (required)"
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} autoFocus />
              <input value={cue} onChange={e => setCue(e.target.value)} placeholder="Short cue (e.g. 3 × 30 sec)"
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} />
              <input value={sets} onChange={e => setSets(e.target.value)} placeholder="Sets / reps (optional)"
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} />
              <div className="flex gap-2 mb-3">
                {(['mobility', 'strength'] as const).map(c => (
                  <button key={c} onClick={() => setCat(c)}
                    className="flex-1 text-xs font-semibold py-2 rounded-lg capitalize"
                    style={{
                      background: cat === c ? (c === 'strength' ? '#F4E3D6' : '#E4ECE6') : '#f5f5f4',
                      color: cat === c ? (c === 'strength' ? '#C17B4F' : '#7E9B86') : '#a8a29e',
                    }}>{c}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={submitCreate} className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl" style={{ background: '#7E9B86' }}>
                  {addToCatId ? 'Create & add' : 'Create'}
                </button>
                <button onClick={() => { setCreating(false); setName(''); setCue(''); setSets(''); }} className="px-4 py-2.5 text-sm text-stone-500 rounded-xl hover:bg-stone-100">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-stone-300 text-sm font-semibold text-stone-400 hover:border-stone-400 hover:text-stone-500">
              ＋ Create new exercise
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
