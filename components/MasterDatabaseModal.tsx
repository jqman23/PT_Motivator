'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';

type Field = 'name'|'cue'|'sets'|'imageSearch'|'gifUrl'|'mainImageUrl'|'mainImageUrls'|'mainVideoUrl'|'cat'|'optional'|'videoIds'|'videoTitles'|'tips';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,120}$/;

export default function MasterDatabaseModal({ exercises, layout, onLibraryChange, onLayoutChange, onClose }: {
  exercises: Exercise[];
  layout: CategoryConfig[];
  onLibraryChange: (e: Exercise[]) => void;
  onLayoutChange: (l: CategoryConfig[]) => void;
  onClose: () => void;
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
  const [gifStatus, setGifStatus] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameStatus, setRenameStatus] = useState('');

  const filtered = useMemo(
    () => draft.filter(e => !q || JSON.stringify(e).toLowerCase().includes(q.toLowerCase())),
    [draft, q]
  );

  const ids = Object.keys(selected).filter(id => selected[id]);
  const target = ids.length ? ids : filtered.map(e => e.id);

  const patch = (id: string, p: Partial<Exercise>) => {
    setDraft(prev => prev.map(e => e.id === id ? { ...e, ...p } : e));
  };

  const list = (v: unknown) => Array.isArray(v) ? v.join('\n') : String(v ?? '');
  const split = (v: string) => v.split(/\n|,/).map(x => x.trim()).filter(Boolean);
  const cleanType = (v: string) => v.toLowerCase().replace(/[^a-z0-9 /&-]+/g, '').trim();
  const asString = (v: unknown) => typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const normalizeName = (v: unknown) => asString(v).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  const importedList = (v: unknown) => Array.isArray(v) ? v.map(asString).filter(Boolean) : asString(v) ? split(asString(v)) : undefined;
  const uniqueCategoryId = (name: string, used: Set<string>) => {
    const slug = normalizeName(name).replace(/\s+/g, '-').slice(0, 28) || 'category';
    let id = `cat-${slug}-${Date.now().toString(36)}`;
    let suffix = 1;
    while (used.has(id)) {
      id = `cat-${slug}-${Date.now().toString(36)}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return id;
  };
  const uniqueExerciseId = (name: string, used: Set<string>) => {
    const slug = normalizeName(name).replace(/\s+/g, '-').slice(0, 36) || 'exercise';
    let id = `custom-${slug}-${Date.now().toString(36)}`;
    let suffix = 1;
    while (used.has(id)) {
      id = `custom-${slug}-${Date.now().toString(36)}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return id;
  };
  const currentCat = (id: string) => layout.find(c => c.exerciseIds.includes(id))?.id ?? '';
  const typeOptions = useMemo(() => Array.from(new Set(draft.map(e => e.cat).filter(Boolean))).sort(), [draft]);
  const buttonBase = 'w-full rounded-xl py-2 text-xs font-semibold border transition-colors disabled:opacity-50';
  const buttonPrimary = `${buttonBase} text-white border-transparent bg-[#7E9B86]`;
  const buttonSecondary = `${buttonBase} bg-white border-stone-200 text-stone-600 hover:bg-stone-50`;
  const buttonWarm = `${buttonBase} bg-[#FBF5E8] border-[#F4E3D6] text-stone-700 hover:bg-[#F4E3D6]`;
  const buttonDanger = `${buttonBase} bg-red-50 text-red-600 border-red-100 hover:bg-red-100`;

  const bulk = () => setDraft(prev => prev.map(e => {
    if (!target.includes(e.id)) return e;

    let next: unknown = value;
    if (field === 'optional') next = /true|yes|1/i.test(value);
    if (field === 'cat') next = cleanType(value) || 'mobility';
    if (['videoIds','videoTitles','tips','mainImageUrls'].includes(field)) next = split(value).slice(0, field === 'mainImageUrls' ? 3 : 999);

    return { ...e, [field]: next } as Exercise;
  }));

  const moveBulk = () => onLayoutChange(layout.map(c => ({
    ...c,
    exerciseIds: c.id === catId
      ? Array.from(new Set([...c.exerciseIds, ...target]))
      : c.exerciseIds.filter(id => !target.includes(id)),
  })));

  const moveOne = (id: string, to: string) => onLayoutChange(layout.map(c => ({
    ...c,
    exerciseIds: c.id === to
      ? Array.from(new Set([...c.exerciseIds, id]))
      : c.exerciseIds.filter(x => x !== id),
  })));

  const renameOne = async (oldId: string, rawNewId: string) => {
    const newId = rawNewId.trim();
    if (!newId || newId === oldId || renamingId) return;
    if (!ID_PATTERN.test(newId)) {
      alert('ID must be 2–121 characters and use only letters, numbers, dashes, or underscores.');
      return;
    }
    if (draft.some(ex => ex.id === newId)) {
      alert(`That ID already exists in the master database:\n\n${newId}`);
      return;
    }

    const current = draft.find(ex => ex.id === oldId);
    if (!current) return;
    const ok = window.confirm(`Rename this exercise ID?\n\n${current.name}\n\n${oldId}\n→ ${newId}\n\nThis also migrates workout logs and notes from the old ID to the new ID.`);
    if (!ok) return;

    setRenamingId(oldId);
    setRenameStatus(`Renaming ${oldId} → ${newId}…`);
    try {
      const res = await fetch('/api/exercise-id/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldId, newId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not migrate logs/notes.');

      const nextDraft = draft.map(ex => ex.id === oldId ? { ...ex, id: newId } : ex);
      const nextLayout = layout.map(cat => ({
        ...cat,
        exerciseIds: cat.exerciseIds.map(id => id === oldId ? newId : id),
      }));
      setDraft(nextDraft);
      onLibraryChange(nextDraft);
      onLayoutChange(nextLayout);
      setSelected(prev => {
        const next = { ...prev };
        if (next[oldId]) {
          delete next[oldId];
          next[newId] = true;
        }
        return next;
      });
      setRenameStatus(`Renamed ${oldId} → ${newId}. Logs/notes migrated.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not rename exercise ID.');
      setRenameStatus('ID rename failed.');
    } finally {
      setRenamingId(null);
    }
  };

  const deleteTarget = () => {
    if (!target.length) return;
    const names = draft.filter(e => target.includes(e.id)).slice(0, 5).map(e => e.name).join(', ');
    if (!window.confirm(`Delete ${target.length} exercise${target.length === 1 ? '' : 's'} from the master database${names ? `?\n\n${names}` : '?'}`)) return;
    setDraft(prev => prev.filter(e => !target.includes(e.id)));
    onLayoutChange(layout.map(c => ({ ...c, exerciseIds: c.exerciseIds.filter(id => !target.includes(id)) })));
    setSelected({});
  };

  const fileToImageDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not prepare image'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });

  const uploadImage = async (id: string, file?: File | null) => {
    if (!file) return;
    setUploadingId(id);
    try {
      const dataUrl = await fileToImageDataUrl(file);
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, name: file.name }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
      const current = draft.find(ex => ex.id === id);
      const nextPhotos = Array.from(new Set([...(current?.mainImageUrls ?? []), current?.mainImageUrl, data.url].filter(Boolean) as string[])).slice(0, 3);
      patch(id, { mainImageUrl: nextPhotos[0], mainImageUrls: nextPhotos });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingId(null);
    }
  };

  const normalizeImportedExercise = (raw: unknown): Partial<Exercise> & { id?: string } | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const name = asString(item.name ?? item.title ?? item.exerciseName);
    const id = asString(item.id);
    const sourceId = asString(item.sourceId ?? item.externalId);
    if (!name && !id && !sourceId) return null;

    const out: Partial<Exercise> & { id?: string } = {};
    if (name) out.name = name;
    if (id) out.id = id;

    const stringFields: Array<keyof Exercise> = ['cue', 'sets', 'imageSearch', 'gifUrl', 'mainImageUrl', 'mainVideoUrl', 'sourceId'];
    stringFields.forEach(fieldName => {
      const value = asString(fieldName === 'sourceId' ? (item.sourceId ?? item.externalId) : item[fieldName]);
      if (value) (out as Record<string, unknown>)[fieldName] = value;
    });
    const typeValue = cleanType(asString(item.type ?? item.cat ?? item.category));
    if (typeValue) out.cat = typeValue;
    if (typeof item.optional === 'boolean') out.optional = item.optional;
    if (['hep', 'patient_added', 'exercisedb', 'api_ninjas'].includes(asString(item.origin))) out.origin = asString(item.origin) as NonNullable<Exercise['origin']>;

    const videoIds = importedList(item.videoIds);
    const videoTitles = importedList(item.videoTitles);
    const tips = importedList(item.tips ?? item.instructions);
    const mainImageUrls = importedList(item.mainImageUrls ?? item.imageUrls ?? item.photoUrls);
    if (videoIds) out.videoIds = videoIds;
    if (videoTitles) out.videoTitles = videoTitles;
    if (tips) out.tips = tips;
    if (mainImageUrls) out.mainImageUrls = mainImageUrls.slice(0, 3);

    return out;
  };

  const normalizeImportedCategory = (raw: unknown): Partial<CategoryConfig> & { id?: string } | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const name = asString(item.name ?? item.title ?? item.label);
    const id = asString(item.id ?? item.key);
    if (!name && !id) return null;

    const out: Partial<CategoryConfig> & { id?: string } = {};
    if (id) out.id = id;
    if (name) out.name = name;

    const color = asString(item.color);
    if (color) out.color = color;
    const exerciseIds = importedList(item.exerciseIds ?? item.ids ?? item.items);
    if (exerciseIds) out.exerciseIds = exerciseIds;

    return out;
  };

  const importJsonToDraft = () => {
    try {
      const parsed = JSON.parse(json);
      const rawItems: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.exercises)
          ? parsed.exercises
          : parsed.name
            ? [parsed]
            : [];
      const rawLayout: unknown[] = Array.isArray(parsed)
        ? []
        : Array.isArray(parsed.layout)
          ? parsed.layout
          : Array.isArray(parsed.categories)
          ? parsed.categories
          : Array.isArray(parsed.categoryConfig)
            ? parsed.categoryConfig
            : [];
      if (!rawItems.length && !rawLayout.length) {
        alert('No exercises or categories found in JSON.');
        return;
      }

      let draftUpdated = 0;
      let draftAdded = 0;
      let categoryUpdated = 0;
      let categoryAdded = 0;

      setDraft(prev => {
        const usedIds = new Set(prev.map(ex => ex.id));
        const next = [...prev];

        rawItems.forEach(raw => {
          const incoming = normalizeImportedExercise(raw);
          if (!incoming) return;

          const sourceId = incoming.sourceId;
          const incomingName = normalizeName(incoming.name);
          let index = incoming.id ? next.findIndex(ex => ex.id === incoming.id) : -1;
          if (index < 0 && sourceId) index = next.findIndex(ex => ex.sourceId === sourceId);
          if (index < 0 && incomingName) index = next.findIndex(ex => normalizeName(ex.name) === incomingName);

          if (index >= 0) {
            const { id: _ignoredId, ...patch } = incoming;
            next[index] = { ...next[index], ...patch, id: next[index].id };
            draftUpdated += 1;
          } else {
            if (!incoming.name) return;
            const id = incoming.id && !usedIds.has(incoming.id) ? incoming.id : uniqueExerciseId(incoming.name, usedIds);
            usedIds.add(id);
            next.push({
              id,
              cat: incoming.cat ?? 'mobility',
              name: incoming.name,
              cue: incoming.cue ?? '',
              sets: incoming.sets,
              videoIds: incoming.videoIds ?? [],
              videoTitles: incoming.videoTitles ?? [],
              imageSearch: incoming.imageSearch ?? incoming.name,
              tips: incoming.tips ?? [],
              optional: incoming.optional,
              origin: incoming.origin ?? 'patient_added',
              sourceId: incoming.sourceId,
              gifUrl: incoming.gifUrl,
              mainImageUrl: incoming.mainImageUrl,
              mainImageUrls: incoming.mainImageUrls,
              mainVideoUrl: incoming.mainVideoUrl,
            });
            draftAdded += 1;
          }
        });
        return next;
      });

      if (rawLayout.length) {
        const usedIds = new Set(layout.map(cat => cat.id));
        const nextLayout = [...layout];
        let addedCategories = 0;
        let updatedCategories = 0;

        rawLayout.forEach(raw => {
          const incoming = normalizeImportedCategory(raw);
          if (!incoming) return;

          const incomingName = normalizeName(incoming.name);
          let index = incoming.id ? nextLayout.findIndex(cat => cat.id === incoming.id) : -1;
          if (index < 0 && incomingName) index = nextLayout.findIndex(cat => normalizeName(cat.name) === incomingName);

          const incomingExerciseIds = Array.from(new Set(incoming.exerciseIds ?? []));

          if (index >= 0) {
            const current = nextLayout[index];
            nextLayout[index] = {
              ...current,
              ...incoming,
              id: current.id,
              name: incoming.name ?? current.name,
              color: incoming.color ?? current.color,
              exerciseIds: Array.from(new Set([...(current.exerciseIds ?? []), ...incomingExerciseIds])),
            };
            categoryUpdated += 1;
          } else {
            const id = incoming.id && !usedIds.has(incoming.id)
              ? incoming.id
              : uniqueCategoryId(incoming.name ?? incoming.id ?? 'category', usedIds);
            usedIds.add(id);
            nextLayout.push({
              id,
              name: incoming.name ?? id,
              color: incoming.color ?? layout[0]?.color ?? 'green',
              exerciseIds: incomingExerciseIds,
            });
            categoryAdded += 1;
          }
        });

        onLayoutChange(nextLayout);
      }

      const messages: string[] = [];
      if (rawItems.length) messages.push(`exercises updated ${draftUpdated}, added ${draftAdded}`);
      if (rawLayout.length) messages.push(`categories updated ${categoryUpdated}, added ${categoryAdded}`);
      window.setTimeout(() => alert(`Merged JSON into draft: ${messages.join('; ')}. Click Save database to commit.`), 0);
    } catch (err) {
      alert(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const save = () => {
    onLibraryChange(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const makeQueries = (ex: Exercise) => {
    const base = [
      ex.name,
      `${ex.name} ${ex.cue}`,
      ex.imageSearch,
      ex.cue,
    ].filter(Boolean);

    return Array.from(new Set(base.map(v => String(v).trim()).filter(v => v.length > 1)));
  };

  const isBrokenGif = (url?: string) =>
    !url ||
    url.includes('/api/exercisedb-image/') ||
    url.includes('v2.exercisedb.io/image/') ||
    url.includes('exercisedb-image');

  const fillGifs = async () => {
    setGifLoading(true);
    setGifStatus('Starting selected GIF autofill…');

    try {
      const selectedIds = Object.keys(selected).filter(id => selected[id]);
      const selectedRows = draft
        .filter(e => selectedIds.includes(e.id))
        .map(e => ({
          id: e.id,
          name: e.name,
          cue: e.cue,
          imageSearch: e.imageSearch,
        }));

      if (!selectedRows.length) {
        alert('Select/check the rows you want to fill first.');
        setGifStatus('No selected rows.');
        return;
      }

      const res = await fetch('/api/exercisedb-gif/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ exercises: selectedRows }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setGifStatus('GIF autofill failed.');
        alert(`GIF autofill failed: ${data?.error ?? res.status}`);
        return;
      }

      const updates = data.updates ?? {};
      const filled = Number(data.filled ?? 0);
      const checked = Number(data.checked ?? selectedRows.length);

      setDraft(prev => prev.map(row =>
        updates[row.id]
          ? { ...row, gifUrl: updates[row.id], origin: row.origin ?? 'exercisedb' }
          : row
      ));

      const debugLines = Array.isArray(data.debug)
        ? data.debug.slice(0, 15).map((d: any) =>
            `${d.status}: ${d.name ?? d.id}${d.match ? ` → ${d.match}` : ''}${d.score !== undefined ? ` (${d.score})` : ''}`
          ).join('\n')
        : '';

      setGifStatus(`Done: filled ${filled} of ${checked} selected rows. Click Save database.`);
      alert(`GIF autofill done: filled ${filled} of ${checked} selected rows. Click Save database.\n\n${debugLines}`);
    } catch (err) {
      setGifStatus('GIF autofill failed.');
      alert(`GIF autofill failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGifLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-5" onPointerDown={onClose}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-6xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col" onPointerDown={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-200 flex justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-stone-800">Master database</h2>
            <p className="text-xs text-stone-500">Bulk edit every exercise field. Desktop only.</p>
          </div>
          <button onPointerDown={onClose} className="w-9 h-9 rounded-full hover:bg-stone-200 text-xl text-stone-500">×</button>
        </div>

        <div className="sm:hidden p-5">
          <div className="bg-white rounded-2xl border border-stone-100 p-4 text-center text-sm font-semibold text-stone-700">Auto-disabled on mobile. Open on desktop for safe bulk editing.</div>
        </div>

        <div className="hidden sm:flex min-h-0 flex-1">
          <aside className="w-72 border-r border-stone-200 p-4 overflow-y-auto space-y-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search anything…" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSelected(Object.fromEntries(filtered.map(e => [e.id,true])))} className={buttonSecondary}>Select visible</button>
              <button onClick={() => setSelected({})} className={buttonSecondary}>Clear</button>
            </div>

            <p className="text-xs text-stone-400">Bulk target: {target.length} ({ids.length ? 'selected' : 'visible'})</p>
            <p className="text-xs text-stone-400">GIF target: {ids.length} selected rows</p>
            {renameStatus && <p className="text-[11px] text-stone-500 leading-snug">{renameStatus}</p>}

            <div className="bg-white rounded-2xl border border-stone-100 p-3 space-y-2">
              <select value={field} onChange={e => setField(e.target.value as Field)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white">
                {['name','cue','sets','imageSearch','gifUrl','mainImageUrl','mainImageUrls','mainVideoUrl','cat','optional','videoIds','videoTitles','tips'].map(f => <option key={f}>{f}</option>)}
              </select>
              <textarea value={value} onChange={e => setValue(e.target.value)} rows={5} placeholder="New value…" className="w-full rounded-xl border px-3 py-2 text-xs resize-none" />
              <button onClick={bulk} className={buttonPrimary}>Apply bulk value</button>
            </div>

            <div className="bg-white rounded-2xl border border-stone-100 p-3 space-y-2">
              <select value={catId} onChange={e => setCatId(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white">
                {layout.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={moveBulk} className={buttonWarm}>Move target category</button>
            </div>

            <div className="bg-white rounded-2xl border border-stone-100 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">JSON merge</p>
              <textarea value={json} onChange={e => setJson(e.target.value)} rows={8} placeholder="Paste exercise JSON to merge by id, sourceId, or name..." className="w-full font-mono text-[10px] rounded-xl border border-stone-200 p-2 resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setJson(JSON.stringify({ exercises: draft, layout }, null, 2))} className={buttonSecondary}>Export JSON</button>
                <button onClick={importJsonToDraft} disabled={!json.trim()} className={buttonPrimary}>Merge JSON</button>
              </div>
            </div>

            <button onClick={fillGifs} disabled={gifLoading} className={buttonSecondary}>
              {gifLoading ? 'Finding GIFs…' : 'Overwrite selected GIFs from ExerciseDB'}
            </button>
            {gifStatus && <p className="text-[11px] text-stone-500 leading-snug">{gifStatus}</p>}

            <button onClick={deleteTarget} className={buttonDanger}>Delete target exercises</button>
            <button onClick={save} className={buttonWarm}>{saved ? 'Saved' : 'Save database'}</button>
          </aside>

          <div className="flex-1 overflow-auto p-4">
            <table className="w-full min-w-[1190px] border-separate border-spacing-y-2 text-xs">
              <thead>
                <tr className="text-left text-stone-400 uppercase tracking-widest">
                  <th>✓</th><th>ID</th><th>Name</th><th>Cue</th><th>Sets</th><th>Type</th><th>Category</th><th>Opt</th><th>Main media</th><th>Search/GIF</th><th>Videos</th><th>Tips</th>
                </tr>
              </thead>
              <tbody>{filtered.map(e => (
                <tr key={e.id} className="bg-white align-top shadow-sm">
                  <td className="p-2 rounded-l-xl"><input type="checkbox" checked={!!selected[e.id]} onChange={x => setSelected(s => ({...s,[e.id]:x.target.checked}))} /></td>
                  <td className="p-2">
                    <input
                      defaultValue={e.id}
                      disabled={renamingId === e.id}
                      onBlur={x => {
                        const next = x.currentTarget.value.trim();
                        if (next !== e.id) void renameOne(e.id, next).finally(() => { x.currentTarget.value = next || e.id; });
                      }}
                      onKeyDown={x => {
                        if (x.key === 'Enter') x.currentTarget.blur();
                        if (x.key === 'Escape') { x.currentTarget.value = e.id; x.currentTarget.blur(); }
                      }}
                      className="w-48 border rounded-lg p-1 font-mono text-[10px] bg-white disabled:opacity-60"
                      title="Edit ID and migrate logs/notes"
                    />
                  </td>
                  <td className="p-2"><textarea value={e.name} onChange={x=>patch(e.id,{name:x.target.value})} rows={2} className="w-40 border rounded-lg p-1 resize-none" /></td>
                  <td className="p-2"><textarea value={e.cue} onChange={x=>patch(e.id,{cue:x.target.value})} rows={2} className="w-52 border rounded-lg p-1 resize-none" /></td>
                  <td className="p-2"><textarea value={e.sets ?? ''} onChange={x=>patch(e.id,{sets:x.target.value})} rows={2} className="w-28 border rounded-lg p-1 resize-none" /></td>
                  <td className="p-2">
                    <input
                      value={e.cat}
                      onChange={x=>patch(e.id,{cat:cleanType(x.target.value)})}
                      list="master-exercise-types"
                      className="w-28 border rounded-lg p-1 bg-white"
                    />
                  </td>
                  <td className="p-2"><select value={currentCat(e.id)} onChange={x=>moveOne(e.id,x.target.value)} className="w-36 border rounded-lg p-1 bg-white"><option value="">Unassigned</option>{layout.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                  <td className="p-2"><input type="checkbox" checked={!!e.optional} onChange={x=>patch(e.id,{optional:x.target.checked})} /></td>
                  <td className="p-2">
                    <div className="space-y-1">
                      {((e.mainImageUrls?.[0] || e.mainImageUrl)) && <img src={e.mainImageUrls?.[0] || e.mainImageUrl} alt="" className="w-36 h-20 rounded-lg object-cover border" />}
                      <textarea
                        value={list(Array.from(new Set([...(e.mainImageUrls ?? []), e.mainImageUrl].filter((url): url is string => !!url?.trim()))).slice(0, 3))}
                        onChange={x => {
                          const nextPhotos = split(x.target.value).slice(0, 3);
                          patch(e.id, { mainImageUrls: nextPhotos, mainImageUrl: nextPhotos[0] });
                        }}
                        rows={3}
                        className="w-52 border rounded-lg p-1 resize-none"
                        placeholder="up to 3 main photo URLs, one per line"
                      />
                      <label className="block w-52 rounded-lg bg-stone-100 py-1.5 text-center text-[11px] font-semibold text-stone-600 cursor-pointer">
                        {uploadingId === e.id ? 'Uploading...' : 'Upload image'}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingId === e.id} onChange={x => { void uploadImage(e.id, x.target.files?.[0]); x.currentTarget.value = ''; }} />
                      </label>
                      <textarea value={e.mainVideoUrl ?? ''} onChange={x=>patch(e.id,{mainVideoUrl:x.target.value})} rows={2} className="w-52 border rounded-lg p-1 resize-none" placeholder="main YouTube/video URL" />
                    </div>
                  </td>
                  <td className="p-2">
                    <textarea value={e.imageSearch} onChange={x=>patch(e.id,{imageSearch:x.target.value})} rows={2} className="w-52 border rounded-lg p-1 resize-none" placeholder="imageSearch" />
                    <textarea value={e.gifUrl ?? ''} onChange={x=>patch(e.id,{gifUrl:x.target.value})} rows={2} className="w-52 border rounded-lg p-1 resize-none mt-1" placeholder="gifUrl" />
                  </td>
                  <td className="p-2"><textarea value={list(e.videoIds)} onChange={x=>patch(e.id,{videoIds:split(x.target.value)})} rows={3} className="w-32 border rounded-lg p-1 resize-none" /></td>
                  <td className="p-2 rounded-r-xl"><textarea value={list(e.tips)} onChange={x=>patch(e.id,{tips:x.target.value.split('\n').filter(Boolean)})} rows={3} className="w-60 border rounded-lg p-1 resize-none" /></td>
                </tr>
              ))}</tbody>
            </table>
            <datalist id="master-exercise-types">
              {typeOptions.map(type => <option key={type} value={type} />)}
            </datalist>
          </div>
        </div>
      </div>
    </div>
  );
}
