'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';

type EditableField = 'name' | 'cue' | 'sets' | 'imageSearch' | 'cat' | 'optional' | 'origin' | 'videoIds' | 'videoTitles' | 'tips';

interface Props {
  exercises: Exercise[];
  layout: CategoryConfig[];
  onLibraryChange: (exercises: Exercise[]) => void;
  onLayoutChange: (layout: CategoryConfig[]) => void;
  onClose: () => void;
}

const FIELD_OPTIONS: { key: EditableField; label: string; hint: string }[] = [
  { key: 'name', label: 'Name', hint: 'Exercise title' },
  { key: 'cue', label: 'Cue', hint: 'Short card subtitle' },
  { key: 'sets', label: 'Sets', hint: '3 × 10–12 reps' },
  { key: 'imageSearch', label: 'Image search', hint: 'Google/Wikimedia query' },
  { key: 'cat', label: 'Type', hint: 'mobility or strength' },
  { key: 'optional', label: 'Optional', hint: 'true / false' },
  { key: 'origin', label: 'Origin', hint: 'hep / patient_added / exercisedb / api_ninjas' },
  { key: 'videoIds', label: 'Video IDs', hint: 'Comma or line separated' },
  { key: 'videoTitles', label: 'Video titles', hint: 'Comma or line separated' },
  { key: 'tips', label: 'Tips', hint: 'One tip per line' },
];

function listValue(value: unknown) {
  return Array.isArray(value) ? value.join('\n') : String(value ?? '');
}

function parseValue(field: EditableField, value: string): Exercise[EditableField] {
  const trimmed = value.trim();
  if (field === 'optional') return /^(true|yes|1|on)$/i.test(trimmed) as Exercise[EditableField];
  if (field === 'cat') return (trimmed === 'strength' ? 'strength' : 'mobility') as Exercise[EditableField];
  if (field === 'videoIds' || field === 'videoTitles') return trimmed.split(/[\n,]+/).map(v => v.trim()).filter(Boolean) as Exercise[EditableField];
  if (field === 'tips') return trimmed.split('\n').map(v => v.trim()).filter(Boolean) as Exercise[EditableField];
  return trimmed as Exercise[EditableField];
}

function currentCategoryId(layout: CategoryConfig[], exId: string) {
  return layout.find(c => c.exerciseIds.includes(exId))?.id ?? '';
}

export default function MasterDatabaseModal({ exercises, layout, onLibraryChange, onLayoutChange, onClose }: Props) {
  const [draft, setDraft] = useState<Exercise[]>(exercises.map(ex => ({ ...ex })));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [field, setField] = useState<EditableField>('cue');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkCategory, setBulkCategory] = useState(layout[0]?.id ?? '');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [saved, setSaved] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return draft;
    return draft.filter(ex => [ex.id, ex.name, ex.cue, ex.sets, ex.imageSearch, ex.origin].some(v => String(v ?? '').toLowerCase().includes(q)));
  }, [draft, query]);

  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const targetIds = selectedIds.length ? selectedIds : filtered.map(ex => ex.id);

  const patchExercise = (id: string, patch: Partial<Exercise>) => {
    setDraft(prev => prev.map(ex => ex.id === id ? { ...ex, ...patch } : ex));
  };

  const applyBulk = () => {
    const nextValue = parseValue(field, bulkValue);
    setDraft(prev => prev.map(ex => targetIds.includes(ex.id) ? { ...ex, [field]: nextValue } : ex));
  };

  const moveToCategory = () => {
    if (!bulkCategory) return;
    onLayoutChange(layout.map(cat => ({
      ...cat,
      exerciseIds: cat.id === bulkCategory
        ? Array.from(new Set([...cat.exerciseIds, ...targetIds]))
        : cat.exerciseIds.filter(id => !targetIds.includes(id)),
    })));
  };

  const updateOneCategory = (exId: string, catId: string) => {
    onLayoutChange(layout.map(cat => ({
      ...cat,
      exerciseIds: cat.id === catId
        ? Array.from(new Set([...cat.exerciseIds, exId]))
        : cat.exerciseIds.filter(id => id !== exId),
    })));
  };

  const save = () => {
    onLibraryChange(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const exportJson = () => {
    setJsonText(JSON.stringify(draft, null, 2));
    setJsonOpen(true);
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) setDraft(parsed as Exercise[]);
    } catch (err) {
      alert('Could not parse JSON. Check commas/quotes and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-5" onPointerDown={onClose}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-6xl sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '92dvh' }} onPointerDown={e => e.stopPropagation()}>
        <div className="px-4 sm:px-5 py-4 border-b border-stone-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-stone-800">Master database</h2>
            <p className="text-xs text-stone-500 mt-1">Bulk edit exercise fields, category placement, videos, image searches, tips, and raw JSON.</p>
          </div>
          <button onPointerDown={onClose} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="sm:hidden p-5">
          <div className="rounded-2xl bg-white border border-stone-100 p-4 text-center">
            <p className="text-sm font-semibold text-stone-800">Desktop feature</p>
            <p className="text-xs text-stone-400 mt-1">Bulk database editing is auto-disabled on mobile so you do not accidentally overwrite fields on a small screen.</p>
          </div>
        </div>

        <div className="hidden sm:flex flex-1 min-h-0">
          <aside className="w-72 border-r border-stone-200 p-4 overflow-y-auto space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Search / select</p>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search any field…" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none" />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => setSelected(Object.fromEntries(filtered.map(ex => [ex.id, true])))} className="rounded-xl bg-white border border-stone-100 py-2 text-xs font-semibold text-stone-600">Select visible</button>
                <button onClick={() => setSelected({})} className="rounded-xl bg-white border border-stone-100 py-2 text-xs font-semibold text-stone-600">Clear</button>
              </div>
              <p className="text-[11px] text-stone-400 mt-2">Target: {targetIds.length} exercise{targetIds.length === 1 ? '' : 's'} ({selectedIds.length ? 'selected' : 'visible'})</p>
            </div>

            <div className="rounded-2xl bg-white border border-stone-100 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Bulk field editor</p>
              <select value={field} onChange={e => setField(e.target.value as EditableField)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white">
                {FIELD_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
              </select>
              <textarea value={bulkValue} onChange={e => setBulkValue(e.target.value)} rows={5} placeholder={FIELD_OPTIONS.find(opt => opt.key === field)?.hint} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs resize-none focus:outline-none" />
              <button onClick={applyBulk} className="w-full rounded-xl py-2 text-sm font-semibold text-white" style={{ background: '#7E9B86' }}>Apply to target</button>
            </div>

            <div className="rounded-2xl bg-white border border-stone-100 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Bulk category move</p>
              <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white">
                {layout.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
              <button onClick={moveToCategory} className="w-full rounded-xl py-2 text-sm font-semibold text-stone-700 bg-[#FBF5E8] border border-[#E8D7B2]">Move target</button>
            </div>

            <div className="rounded-2xl bg-white border border-stone-100 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Power tools</p>
              <button onClick={exportJson} className="w-full rounded-xl bg-stone-50 border border-stone-100 py-2 text-xs font-semibold text-stone-600">Export / edit JSON</button>
              <button onClick={() => setDraft(exercises.map(ex => ({ ...ex })))} className="w-full rounded-xl bg-stone-50 border border-stone-100 py-2 text-xs font-semibold text-stone-600">Reset unsaved edits</button>
              <button onClick={save} className="w-full rounded-xl py-2 text-sm font-semibold text-white" style={{ background: saved ? '#5B9BD5' : '#D9A94B' }}>{saved ? '✓ Saved' : 'Save database'}</button>
            </div>
          </aside>

          <div className="flex-1 overflow-auto p-4">
            <table className="w-full min-w-[1100px] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-stone-400 text-left">
                  <th className="w-8 px-2">✓</th><th className="px-2">Name</th><th className="px-2">Cue</th><th className="px-2">Sets</th><th className="px-2">Type</th><th className="px-2">Category</th><th className="px-2">Optional</th><th className="px-2">Image search</th><th className="px-2">Videos</th><th className="px-2">Tips</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ex => (
                  <tr key={ex.id} className="bg-white shadow-sm align-top">
                    <td className="rounded-l-xl px-2 py-2"><input type="checkbox" checked={!!selected[ex.id]} onChange={e => setSelected(prev => ({ ...prev, [ex.id]: e.target.checked }))} /></td>
                    <td className="px-2 py-2"><textarea value={ex.name} onChange={e => patchExercise(ex.id, { name: e.target.value })} rows={2} className="w-44 rounded-lg border border-stone-200 px-2 py-1 text-xs resize-none" /></td>
                    <td className="px-2 py-2"><textarea value={ex.cue} onChange={e => patchExercise(ex.id, { cue: e.target.value })} rows={2} className="w-56 rounded-lg border border-stone-200 px-2 py-1 text-xs resize-none" /></td>
                    <td className="px-2 py-2"><textarea value={ex.sets ?? ''} onChange={e => patchExercise(ex.id, { sets: e.target.value })} rows={2} className="w-32 rounded-lg border border-stone-200 px-2 py-1 text-xs resize-none" /></td>
                    <td className="px-2 py-2"><select value={ex.cat} onChange={e => patchExercise(ex.id, { cat: e.target.value as Exercise['cat'] })} className="w-28 rounded-lg border border-stone-200 px-2 py-1 text-xs bg-white"><option value="mobility">mobility</option><option value="strength">strength</option></select></td>
                    <td className="px-2 py-2"><select value={currentCategoryId(layout, ex.id)} onChange={e => updateOneCategory(ex.id, e.target.value)} className="w-40 rounded-lg border border-stone-200 px-2 py-1 text-xs bg-white"><option value="">Unassigned</option>{layout.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></td>
                    <td className="px-2 py-2 text-center"><input type="checkbox" checked={!!ex.optional} onChange={e => patchExercise(ex.id, { optional: e.target.checked })} /></td>
                    <td className="px-2 py-2"><textarea value={ex.imageSearch} onChange={e => patchExercise(ex.id, { imageSearch: e.target.value })} rows={2} className="w-56 rounded-lg border border-stone-200 px-2 py-1 text-xs resize-none" /></td>
                    <td className="px-2 py-2"><textarea value={listValue(ex.videoIds)} onChange={e => patchExercise(ex.id, { videoIds: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) })} rows={3} className="w-36 rounded-lg border border-stone-200 px-2 py-1 text-xs resize-none" /></td>
                    <td className="rounded-r-xl px-2 py-2"><textarea value={listValue(ex.tips)} onChange={e => patchExercise(ex.id, { tips: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) })} rows={3} className="w-64 rounded-lg border border-stone-200 px-2 py-1 text-xs resize-none" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {jsonOpen && (
          <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-5" onPointerDown={() => setJsonOpen(false)}>
            <div className="bg-white rounded-2xl w-full max-w-4xl p-4 shadow-2xl" onPointerDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3"><p className="font-semibold text-stone-800">Raw exerciseLibrary JSON</p><button onClick={() => setJsonOpen(false)} className="text-xl text-stone-400">×</button></div>
              <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} rows={18} className="w-full font-mono text-xs rounded-xl border border-stone-200 p-3" />
              <div className="flex justify-end gap-2 mt-3"><button onClick={() => navigator.clipboard?.writeText(jsonText)} className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-100 text-stone-600">Copy</button><button onClick={importJson} className="px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: '#7E9B86' }}>Import into draft</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
