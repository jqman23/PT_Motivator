'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';

type Field = 'name'|'cue'|'sets'|'imageSearch'|'gifUrl'|'cat'|'optional'|'videoIds'|'videoTitles'|'tips';

export default function MasterDatabaseModal({ exercises, layout, onLibraryChange, onLayoutChange, onClose }: {
  exercises: Exercise[]; layout: CategoryConfig[]; onLibraryChange: (e: Exercise[]) => void; onLayoutChange: (l: CategoryConfig[]) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Exercise[]>(exercises.map(e => ({ ...e })));
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [field, setField] = useState<Field>('cue');
  const [value, setValue] = useState('');
  const [catId, setCatId] = useState(layout[0]?.id ?? '');
  const [json, setJson] = useState('');
  const [saved, setSaved] = useState(false);
  const [gifLoading, setGifLoading] = useState(false);

  const filtered = useMemo(() => draft.filter(e => !q || JSON.stringify(e).toLowerCase().includes(q.toLowerCase())), [draft, q]);
  const ids = Object.keys(selected).filter(id => selected[id]);
  const target = ids.length ? ids : filtered.map(e => e.id);
  const patch = (id: string, p: Partial<Exercise>) => setDraft(draft.map(e => e.id === id ? { ...e, ...p } : e));
  const list = (v: unknown) => Array.isArray(v) ? v.join('\n') : String(v ?? '');
  const split = (v: string) => v.split(/\n|,/).map(x => x.trim()).filter(Boolean);
  const currentCat = (id: string) => layout.find(c => c.exerciseIds.includes(id))?.id ?? '';

  const bulk = () => setDraft(draft.map(e => {
    if (!target.includes(e.id)) return e;
    const next: any = field === 'optional' ? /true|yes|1/i.test(value) : field === 'cat' ? (value === 'strength' ? 'strength' : 'mobility') : ['videoIds','videoTitles','tips'].includes(field) ? split(value) : value;
    return { ...e, [field]: next };
  }));

  const moveBulk = () => onLayoutChange(layout.map(c => ({ ...c, exerciseIds: c.id === catId ? Array.from(new Set([...c.exerciseIds, ...target])) : c.exerciseIds.filter(id => !target.includes(id)) })));
  const moveOne = (id: string, to: string) => onLayoutChange(layout.map(c => ({ ...c, exerciseIds: c.id === to ? Array.from(new Set([...c.exerciseIds, id])) : c.exerciseIds.filter(x => x !== id) })));
  const save = () => { onLibraryChange(draft); setSaved(true); setTimeout(() => setSaved(false), 1500); };

  const fillGifs = async () => {
    setGifLoading(true);
    try {
      const next = [...draft];
      for (const id of target) {
        const idx = next.findIndex(e => e.id === id);
        if (idx === -1 || next[idx].gifUrl) continue;
        const res = await fetch(`/api/exercisedb-gif?q=${encodeURIComponent(next[idx].name)}`);
        const data = await res.json();
        if (data.gifUrl) next[idx] = { ...next[idx], gifUrl: data.gifUrl, origin: next[idx].origin ?? 'exercisedb' };
      }
      setDraft(next);
    } finally {
      setGifLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-5" onPointerDown={onClose}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-6xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col" onPointerDown={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-200 flex justify-between gap-3">
          <div><h2 className="font-serif text-xl font-semibold text-stone-800">Master database</h2><p className="text-xs text-stone-500">Bulk edit every exercise field. Desktop only.</p></div>
          <button onPointerDown={onClose} className="w-9 h-9 rounded-full hover:bg-stone-200 text-xl text-stone-500">×</button>
        </div>
        <div className="sm:hidden p-5"><div className="bg-white rounded-2xl border border-stone-100 p-4 text-center text-sm font-semibold text-stone-700">Auto-disabled on mobile. Open on desktop for safe bulk editing.</div></div>
        <div className="hidden sm:flex min-h-0 flex-1">
          <aside className="w-72 border-r border-stone-200 p-4 overflow-y-auto space-y-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search anything…" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2"><button onClick={() => setSelected(Object.fromEntries(filtered.map(e => [e.id,true])))} className="bg-white rounded-xl border py-2 text-xs font-semibold">Select visible</button><button onClick={() => setSelected({})} className="bg-white rounded-xl border py-2 text-xs font-semibold">Clear</button></div>
            <p className="text-xs text-stone-400">Target: {target.length} ({ids.length ? 'selected' : 'visible'})</p>
            <div className="bg-white rounded-2xl border border-stone-100 p-3 space-y-2">
              <select value={field} onChange={e => setField(e.target.value as Field)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white">{['name','cue','sets','imageSearch','gifUrl','cat','optional','videoIds','videoTitles','tips'].map(f => <option key={f}>{f}</option>)}</select>
              <textarea value={value} onChange={e => setValue(e.target.value)} rows={5} placeholder="New value…" className="w-full rounded-xl border px-3 py-2 text-xs resize-none" />
              <button onClick={bulk} className="w-full rounded-xl py-2 text-sm font-semibold text-white bg-[#7E9B86]">Apply bulk value</button>
            </div>
            <div className="bg-white rounded-2xl border border-stone-100 p-3 space-y-2">
              <select value={catId} onChange={e => setCatId(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white">{layout.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <button onClick={moveBulk} className="w-full rounded-xl py-2 text-sm font-semibold bg-[#FBF5E8] text-stone-700">Move target category</button>
            </div>
            <button onClick={() => setJson(JSON.stringify(draft,null,2))} className="w-full rounded-xl bg-white border py-2 text-xs font-semibold">Export JSON</button>
            {json && <textarea value={json} onChange={e => setJson(e.target.value)} rows={8} className="w-full font-mono text-[10px] rounded-xl border p-2" />}
            {json && <button onClick={() => setDraft(JSON.parse(json))} className="w-full rounded-xl bg-stone-100 py-2 text-xs font-semibold">Import JSON to draft</button>}
            <button onClick={fillGifs} disabled={gifLoading} className="w-full rounded-xl bg-[#E4ECE6] py-2 text-xs font-semibold text-[#5f7d67] disabled:opacity-50">{gifLoading ? 'Finding GIFs…' : 'Fill missing GIFs from ExerciseDB'}</button>
            <button onClick={save} className="w-full rounded-xl py-2 text-sm font-semibold text-white bg-[#D9A94B]">{saved ? '✓ Saved' : 'Save database'}</button>
          </aside>
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full min-w-[1050px] border-separate border-spacing-y-2 text-xs">
              <thead><tr className="text-left text-stone-400 uppercase tracking-widest"><th>✓</th><th>Name</th><th>Cue</th><th>Sets</th><th>Type</th><th>Category</th><th>Opt</th><th>Image</th><th>GIF</th><th>Videos</th><th>Tips</th></tr></thead>
              <tbody>{filtered.map(e => <tr key={e.id} className="bg-white align-top shadow-sm">
                <td className="p-2 rounded-l-xl"><input type="checkbox" checked={!!selected[e.id]} onChange={x => setSelected(s => ({...s,[e.id]:x.target.checked}))} /></td>
                <td className="p-2"><textarea value={e.name} onChange={x=>patch(e.id,{name:x.target.value})} rows={2} className="w-40 border rounded-lg p-1 resize-none" /></td>
                <td className="p-2"><textarea value={e.cue} onChange={x=>patch(e.id,{cue:x.target.value})} rows={2} className="w-52 border rounded-lg p-1 resize-none" /></td>
                <td className="p-2"><textarea value={e.sets ?? ''} onChange={x=>patch(e.id,{sets:x.target.value})} rows={2} className="w-28 border rounded-lg p-1 resize-none" /></td>
                <td className="p-2"><select value={e.cat} onChange={x=>patch(e.id,{cat:x.target.value as Exercise['cat']})} className="border rounded-lg p-1 bg-white"><option>mobility</option><option>strength</option></select></td>
                <td className="p-2"><select value={currentCat(e.id)} onChange={x=>moveOne(e.id,x.target.value)} className="w-36 border rounded-lg p-1 bg-white"><option value="">Unassigned</option>{layout.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                <td className="p-2"><input type="checkbox" checked={!!e.optional} onChange={x=>patch(e.id,{optional:x.target.checked})} /></td>
                <td className="p-2"><textarea value={e.imageSearch} onChange={x=>patch(e.id,{imageSearch:x.target.value})} rows={2} className="w-52 border rounded-lg p-1 resize-none" /></td>
                <td className="p-2"><textarea value={e.gifUrl ?? ''} onChange={x=>patch(e.id,{gifUrl:x.target.value})} rows={2} className="w-44 border rounded-lg p-1 resize-none" placeholder="gifUrl" /></td>
                <td className="p-2"><textarea value={list(e.videoIds)} onChange={x=>patch(e.id,{videoIds:split(x.target.value)})} rows={3} className="w-32 border rounded-lg p-1 resize-none" /></td>
                <td className="p-2 rounded-r-xl"><textarea value={list(e.tips)} onChange={x=>patch(e.id,{tips:x.target.value.split('\n').filter(Boolean)})} rows={3} className="w-60 border rounded-lg p-1 resize-none" /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
