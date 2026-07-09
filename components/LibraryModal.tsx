'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig, makeCustomExercise } from '@/lib/layout';

type ExerciseDbResult = {
  source?: 'exercisedb';
  exerciseId: string;
  name: string;
  gifUrl?: string;
  targetMuscles?: string[];
  bodyParts?: string[];
  equipments?: string[];
  instructions?: string[];
};

type ApiNinjasResult = {
  source: 'api_ninjas';
  id: string;
  name: string;
  type?: string;
  muscle?: string;
  difficulty?: string;
  instructions?: string;
  equipments?: string[];
};

type ExternalExerciseResult = ExerciseDbResult | ApiNinjasResult;
type JsonExerciseInput = Record<string, unknown>;
type ParsedJsonExercise = { exercise: Exercise; categoryName?: string };

interface Props {
  builtIns: Exercise[];
  customExercises: Exercise[];
  layout: CategoryConfig[];
  addToCatId?: string | null;
  onPick: (exId: string, catId: string) => void;
  onCreateCustom: (ex: Exercise) => void;
  onImportExercises?: (items: ParsedJsonExercise[]) => void;
  onUpdateCustom: (ex: Exercise) => void;
  onDeleteCustom: (exId: string) => void;
  onClose: () => void;
}

const ORIGIN_OPTIONS: { value: NonNullable<Exercise['origin']>; label: string }[] = [
  { value: 'hep', label: 'HEP' },
  { value: 'exercisedb', label: 'ExerciseDB' },
  { value: 'api_ninjas', label: 'API Ninjas' },
  { value: 'patient_added', label: 'Added' },
];

const toTitleCase = (value: string) => value.replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
const isObject = (value: unknown): value is JsonExerciseInput => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asString = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  const text = asString(value);
  return text ? text.split('\n').map(item => item.trim()).filter(Boolean) : [];
};
const cleanJsonInput = (input: string) => input.trim().replace(/^```(?:json|JSON)?\s*/, '').replace(/\s*```$/, '').trim();
const looksLikeJson = (input: string) => {
  const clean = cleanJsonInput(input);
  return clean.startsWith('{') || clean.startsWith('[') || clean.includes('```json') || clean.includes('```JSON');
};
const normalizeCategoryText = (value: string) => value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

function splitTopLevelObjects(input: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(input.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function parseExerciseJsonInput(input: string, layout: CategoryConfig[]): { items: ParsedJsonExercise[]; error?: string } | null {
  const clean = cleanJsonInput(input);
  if (!looksLikeJson(clean)) return null;

  let rawItems: unknown[] = [];
  try {
    const parsed = JSON.parse(clean);
    rawItems = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const objectChunks = splitTopLevelObjects(clean);
    if (objectChunks.length === 0) return { items: [], error: 'Invalid JSON. Paste one exercise object, an array, or multiple objects.' };
    try {
      rawItems = objectChunks.map(chunk => JSON.parse(chunk));
    } catch {
      return { items: [], error: 'Invalid JSON. One of the pasted exercise objects could not be parsed.' };
    }
  }

  const layoutNames = layout.map(cat => cat.name);
  const resolveCategoryName = (value: unknown) => {
    const raw = asString(value);
    if (!raw) return undefined;
    const normalized = normalizeCategoryText(raw);
    return layoutNames.find(name => normalizeCategoryText(name) === normalized)
      ?? layoutNames.find(name => {
        const candidate = normalizeCategoryText(name);
        return candidate.includes(normalized) || normalized.includes(candidate);
      });
  };

  const items: ParsedJsonExercise[] = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index];
    if (!isObject(item)) return { items: [], error: `Exercise ${index + 1} must be a JSON object.` };

    const name = asString(item.name ?? item.title ?? item.exerciseName);
    if (!name) return { items: [], error: `Exercise ${index + 1} is missing a name.` };

    const cue = asString(item.cue ?? item.shortCue ?? item.description ?? item.note);
    const explicitSets = asString(item.sets ?? item.setRepScheme ?? item.dosage);
    const reps = asString(item.reps ?? item.repCount);
    const sets = explicitSets || (reps ? reps : undefined);
    const categoryName = resolveCategoryName(item.categoryName ?? item.category);
    const catText = asString(item.cat ?? item.type ?? item.category).toLowerCase();
    const cat: Exercise['cat'] = catText.includes('strength') ? 'strength' : 'mobility';
    const originText = asString(item.origin ?? item.source).toLowerCase();
    const origin = ORIGIN_OPTIONS.some(opt => opt.value === originText) ? originText as NonNullable<Exercise['origin']> : 'patient_added';
    const tips = asStringArray(item.tips ?? item.helpfulTips ?? item.instructions ?? item.cues);

    items.push({
      exercise: makeCustomExercise({
        name,
        cue,
        sets,
        cat,
        imageSearch: asString(item.imageSearch ?? item.mediaSearch ?? item.searchTerms) || name,
        tips,
        origin,
        sourceId: asString(item.sourceId ?? item.externalId) || 'json-import',
        gifUrl: asString(item.gifUrl) || undefined,
      }),
      categoryName,
    });
  }

  return { items };
}

export default function LibraryModal({
  builtIns,
  customExercises,
  layout,
  addToCatId,
  onPick,
  onCreateCustom,
  onImportExercises,
  onUpdateCustom,
  onDeleteCustom,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [cue, setCue] = useState('');
  const [sets, setSets] = useState('');
  const [cat, setCat] = useState<Exercise['cat']>('mobility');
  const [origin, setOrigin] = useState<NonNullable<Exercise['origin']>>('patient_added');
  const [tipsText, setTipsText] = useState('');
  const [imageSearch, setImageSearch] = useState('');
  const [sourceId, setSourceId] = useState<string | undefined>();
  const [gifUrl, setGifUrl] = useState<string | undefined>();

  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceResults, setSourceResults] = useState<ExternalExerciseResult[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceImporting, setSourceImporting] = useState<string | null>(null);
  const [sourceMessage, setSourceMessage] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [importedMeta, setImportedMeta] = useState<{ source?: 'exercisedb' | 'api_ninjas'; sourceId?: string; gifUrl?: string } | null>(null);

  const targetCat = addToCatId ? layout.find(c => c.id === addToCatId) : null;
  const tips = tipsText.split('\n').map(t => t.trim()).filter(Boolean);
  const q = query.trim().toLowerCase();

  const assignment = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of layout) for (const id of c.exerciseIds) m[id] = c.name;
    return m;
  }, [layout]);

  const all = useMemo(() => {
    const customIds = new Set(customExercises.map(e => e.id));
    return [...builtIns, ...customExercises].map(e => ({ ...e, isCustom: customIds.has(e.id) }));
  }, [builtIns, customExercises]);

  const filtered = q ? all.filter(e => e.name.toLowerCase().includes(q) || e.cue.toLowerCase().includes(q)) : all;
  const createLabel = importedMeta ? (addToCatId ? 'Create imported & add' : 'Create imported') : (addToCatId ? 'Create manual & add' : 'Create manually');
  const sourceMessageIsError = /failed|could not|unavailable|missing key/i.test(sourceMessage);
  const bulkMessageIsError = /invalid|missing|must be|paste/i.test(bulkMessage);

  const originLabel = (e: Exercise & { isCustom?: boolean }) => {
    if (e.sourceId === 'ai-added' || e.sourceId === 'ai_added') return { text: 'AI Added', color: '#D9A94B', bg: '#FBF5E8' };
    if (e.origin === 'exercisedb') return { text: 'ExerciseDB', color: '#7C3AED', bg: '#ede9fe' };
    if (e.origin === 'api_ninjas') return { text: 'API Ninjas', color: '#5B9BD5', bg: '#dbeafe' };
    if (e.origin === 'patient_added') return { text: 'Added', color: '#5B9BD5', bg: '#dbeafe' };
    return { text: 'HEP', color: '#7E9B86', bg: '#E4ECE6' };
  };

  const resultKey = (result: ExternalExerciseResult) => result.source === 'api_ninjas' ? result.id : result.exerciseId;

  const clearSourceResults = () => {
    setSourceResults([]);
    setSourceMessage('');
    setSourceImporting(null);
    setImportedMeta(null);
  };

  const resetForm = () => {
    setName('');
    setCue('');
    setSets('');
    setCat('mobility');
    setOrigin('patient_added');
    setTipsText('');
    setImageSearch('');
    setSourceId(undefined);
    setGifUrl(undefined);
    setSourceQuery('');
    setSourceResults([]);
    setSourceMessage('');
    setSourceImporting(null);
    setImportedMeta(null);
    setEditing(null);
  };

  const importJsonExercises = (input: string) => {
    const parsed = parseExerciseJsonInput(input, layout);
    if (!parsed) return false;
    if (parsed.error) {
      setBulkMessage(parsed.error);
      return true;
    }
    if (onImportExercises) {
      onImportExercises(parsed.items);
    } else {
      parsed.items.forEach(({ exercise, categoryName }) => {
        const categoryId = categoryName ? layout.find(cat => cat.name === categoryName)?.id : addToCatId;
        const targetId = categoryId ?? addToCatId;
        onCreateCustom(exercise);
        if (targetId) onPick(exercise.id, targetId);
      });
    }
    setQuery('');
    setBulkMessage(`Added ${parsed.items.length} exercise${parsed.items.length === 1 ? '' : 's'} from JSON.`);
    resetForm();
    setCreating(false);
    return true;
  };

  const loadJsonFromTextWindow = () => {
    if (!query.trim()) {
      setBulkMessage('Paste JSON in the text window first.');
      return;
    }
    if (!importJsonExercises(query)) setBulkMessage('Paste valid exercise JSON, then tap Load JSON.');
  };

  const beginCreate = () => {
    const seed = query.trim();
    resetForm();
    setCreating(true);
    if (seed.length > 1) {
      setName(seed);
      setImageSearch(seed);
      setSourceQuery(seed);
      void searchSources(seed, true);
    }
  };

  const beginEdit = (ex: Exercise) => {
    setCreating(false);
    setEditing(ex);
    setName(ex.name);
    setCue(ex.cue);
    setSets(ex.sets ?? '');
    setCat(ex.cat);
    setOrigin(ex.origin ?? 'hep');
    setTipsText((ex.tips ?? []).join('\n'));
    setImageSearch(ex.imageSearch ?? ex.name);
    setSourceId(ex.sourceId);
    setGifUrl(ex.gifUrl);
    clearSourceResults();
  };

  const inferCategory = (exercise: ExternalExerciseResult): Exercise['cat'] => {
    const text = [
      exercise.name,
      ...('bodyParts' in exercise ? (exercise.bodyParts ?? []) : []),
      ...('targetMuscles' in exercise ? (exercise.targetMuscles ?? []) : []),
      ...('equipments' in exercise ? (exercise.equipments ?? []) : []),
      ...('type' in exercise ? [exercise.type ?? ''] : []),
      ...('instructions' in exercise ? (Array.isArray(exercise.instructions) ? exercise.instructions : [exercise.instructions ?? '']) : []),
    ].join(' ').toLowerCase();
    return ['stretch', 'mobility', 'flexibility', 'range of motion', 'rotation', 'circle', 'yoga', 'pose', 'release'].some(word => text.includes(word)) ? 'mobility' : 'strength';
  };

  const searchSources = async (searchTerm?: string, fromCreate = false) => {
    const search = (searchTerm ?? sourceQuery).trim();
    if (search.length < 2) {
      clearSourceResults();
      return [];
    }

    setSourceLoading(true);
    setSourceMessage('');
    setSourceQuery(search);

    try {
      const [exerciseDbRes, apiNinjasRes] = await Promise.all([
        fetch(`/api/exercisedb/search?search=${encodeURIComponent(search)}`).then(r => r.json()).catch(() => ({ success: false, data: [] })),
        fetch(`/api/api-ninjas/exercises?search=${encodeURIComponent(search)}`).then(r => r.json()).catch(() => ({ success: false, data: [] })),
      ]);

      const exerciseDbData: ExternalExerciseResult[] = Array.isArray(exerciseDbRes.data)
        ? exerciseDbRes.data.map((item: ExerciseDbResult) => ({ ...item, source: 'exercisedb' as const }))
        : [];
      const apiNinjasData: ExternalExerciseResult[] = Array.isArray(apiNinjasRes.data)
        ? apiNinjasRes.data.map((item: ApiNinjasResult, index: number) => ({ ...item, source: 'api_ninjas' as const, id: `api-ninjas-${item.name}-${index}` }))
        : [];

      const results = [...exerciseDbData, ...apiNinjasData];
      setSourceResults(results);

      if (results.length > 0) setSourceMessage(fromCreate ? 'Database matches found. Tap one to import metadata, or ignore them and use Create manual & add below.' : 'Database matches found. Tap one to import metadata, or ignore them and create manually below.');
      else if (!exerciseDbRes.success && !apiNinjasRes.success) setSourceMessage('External exercise search failed. You can still create manually.');
      else if (!apiNinjasRes.success) setSourceMessage('ExerciseDB results shown. API Ninjas unavailable. You can still create manually.');
      else setSourceMessage('No database matches found. Manual create is okay.');

      return results;
    } catch {
      setSourceMessage('Could not search external libraries. You can still create manually.');
      setSourceResults([]);
      return [];
    } finally {
      setSourceLoading(false);
    }
  };

  const importResult = async (result: ExternalExerciseResult) => {
    if (result.source === 'api_ninjas') {
      const titleName = toTitleCase(result.name);
      setName(titleName);
      setCue([result.type, result.muscle, result.difficulty].filter(Boolean).join(' · '));
      setImageSearch([titleName, result.muscle, result.type, ...(result.equipments ?? [])].filter(Boolean).join(' '));
      setTipsText(result.instructions ?? '');
      setCat(result.type === 'stretching' ? 'mobility' : 'strength');
      setOrigin('api_ninjas');
      setImportedMeta({ source: 'api_ninjas', sourceId: result.name });
      setSourceId(result.name);
      setGifUrl(undefined);
      setSourceResults([]);
      setSourceQuery('');
      setSourceMessage('Imported source metadata. Review fields, then create.');
      return;
    }

    setSourceImporting(result.exerciseId);
    setSourceMessage('');
    try {
      const res = await fetch(`/api/exercisedb/exercise?id=${encodeURIComponent(result.exerciseId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSourceMessage(json.error || 'Could not import ExerciseDB exercise.');
        return;
      }

      const exercise: ExerciseDbResult = { ...result, ...json.data };
      const titleName = toTitleCase(exercise.name);
      const targetText = exercise.targetMuscles?.join(', ') ?? '';
      const equipmentText = exercise.equipments?.join(', ') ?? '';
      const bodyText = exercise.bodyParts?.join(', ') ?? '';

      setName(titleName);
      setCue([targetText, equipmentText].filter(Boolean).join(' · '));
      setImageSearch([titleName, bodyText, equipmentText].filter(Boolean).join(' '));
      setTipsText(exercise.instructions?.join('\n') ?? '');
      setCat(inferCategory(exercise));
      setOrigin('exercisedb');
      setImportedMeta({ source: 'exercisedb', sourceId: exercise.exerciseId, gifUrl: exercise.gifUrl });
      setSourceId(exercise.exerciseId);
      setGifUrl(exercise.gifUrl);
      setSourceResults([]);
      setSourceQuery('');
      setSourceMessage('Imported source metadata. Review fields, then create.');
    } catch {
      setSourceMessage('Could not import ExerciseDB exercise.');
    } finally {
      setSourceImporting(null);
    }
  };

  const submitCreate = () => {
    if (!name.trim()) return;
    const ex: Exercise = {
      ...makeCustomExercise({
        name,
        cue,
        sets,
        cat,
        imageSearch: imageSearch.trim() || name.trim(),
        tips,
        origin: importedMeta?.source ?? origin,
        sourceId: importedMeta?.sourceId ?? sourceId,
        gifUrl: importedMeta?.gifUrl ?? gifUrl,
      }),
    };
    onCreateCustom(ex);
    if (addToCatId) onPick(ex.id, addToCatId);
    resetForm();
    setCreating(false);
  };

  const submitEdit = () => {
    if (!editing || !name.trim()) return;
    onUpdateCustom({ ...editing, name: name.trim(), cue: cue.trim(), sets: sets.trim() || undefined, cat, origin, imageSearch: imageSearch.trim() || name.trim(), tips, sourceId, gifUrl });
    resetForm();
  };

  const sourceSelect = (
    <select value={origin} onChange={e => setOrigin(e.target.value as NonNullable<Exercise['origin']>)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }}>
      {ORIGIN_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  );

  const formFields = (
    <>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (required)" className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} autoFocus />
      <input value={cue} onChange={e => setCue(e.target.value)} placeholder="Short cue" className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} />
      <input value={sets} onChange={e => setSets(e.target.value)} placeholder="Sets / reps (optional)" className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} />
      <input value={imageSearch} onChange={e => setImageSearch(e.target.value)} placeholder="Media search terms" className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} />
      {sourceSelect}
      <textarea value={tipsText} onChange={e => setTipsText(e.target.value)} placeholder="Instructions / tips — one per line" rows={4} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none resize-none" style={{ fontSize: 16, colorScheme: 'light' }} />
      <div className="flex gap-2 mb-3">
        {(['mobility', 'strength'] as const).map(c => (
          <button key={c} onClick={() => setCat(c)} className="flex-1 text-xs font-semibold py-2 rounded-lg capitalize" style={{ background: cat === c ? (c === 'strength' ? '#F4E3D6' : '#E4ECE6') : '#f5f5f4', color: cat === c ? (c === 'strength' ? '#C17B4F' : '#7E9B86') : '#a8a29e' }}>{c}</button>
        ))}
      </div>
    </>
  );

  const sourceSearchBox = (
    <div className="mb-3 rounded-xl border border-[#E4ECE6] bg-[#F8FBF8] p-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#7E9B86] mb-1.5">Optional source lookup</p>
      <div className="flex gap-1.5">
        <input value={sourceQuery} onChange={e => { setSourceQuery(e.target.value); if (!e.target.value.trim()) clearSourceResults(); }} onKeyDown={e => { if (e.key === 'Enter') searchSources(); if (e.key === 'Escape') clearSourceResults(); }} placeholder="Search e.g. calf raise" className="flex-1 min-w-0 text-sm border border-stone-200 rounded-lg px-2.5 py-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />
        <button onClick={() => searchSources()} disabled={sourceLoading || sourceQuery.trim().length < 2} className="px-3 py-2 text-xs font-bold rounded-lg text-white disabled:opacity-40" style={{ background: '#7E9B86' }}>{sourceLoading ? '…' : 'Search'}</button>
      </div>
      {sourceMessage && <p className="text-[11px] mt-1.5" style={{ color: sourceMessageIsError ? '#ef4444' : '#78716c' }}>{sourceMessage}</p>}
      {sourceResults.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
          <p className="text-[10px] text-stone-500">Tap a match to import metadata, or ignore these and use the manual create button below.</p>
          {sourceResults.map(result => {
            const isApiNinjas = result.source === 'api_ninjas';
            const key = resultKey(result);
            const subtitle = isApiNinjas ? [result.type, result.muscle, result.difficulty].filter(Boolean).join(' · ') : [result.bodyParts?.join(', '), result.targetMuscles?.join(', '), result.equipments?.join(', ')].filter(Boolean).join(' · ');
            return (
              <button key={key} onClick={() => importResult(result)} disabled={!!sourceImporting} className="w-full text-left bg-white border border-stone-100 rounded-lg px-2.5 py-2 hover:bg-stone-50 disabled:opacity-60">
                <p className="text-xs font-semibold text-stone-800 truncate">{sourceImporting === key ? 'Importing…' : toTitleCase(result.name)}<span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: isApiNinjas ? '#5B9BD5' : '#7C3AED', background: isApiNinjas ? '#dbeafe' : '#ede9fe' }}>{isApiNinjas ? 'API Ninjas' : 'ExerciseDB'}</span></p>
                <p className="text-[10px] text-stone-400 truncate">{subtitle || 'Tap to import'}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8" onClick={onClose}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()} style={{ maxHeight: '92dvh' }}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0"><div className="min-w-0"><h2 className="font-serif text-lg font-semibold text-stone-800 truncate">{targetCat ? `Add to ${targetCat.name}` : 'Exercise library'}</h2><p className="text-[11px] text-stone-400">{targetCat ? 'Tap an exercise to add or remove it' : 'Your editable exercise library'}</p></div><button onClick={() => { resetForm(); onClose(); }} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl flex-shrink-0">×</button></div>

        {!creating && !editing && <div className="px-3 pt-3 flex-shrink-0"><textarea value={query} onChange={e => { setQuery(e.target.value); setBulkMessage(''); }} placeholder="Search, type a new exercise, or paste JSON…" rows={3} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-stone-300 resize-none" style={{ fontSize: 16, colorScheme: 'light' }} /><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={beginCreate} disabled={!query.trim()} className="py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50" style={{ background: '#C17B4F' }}>Create / Search</button><button onClick={loadJsonFromTextWindow} disabled={!query.trim()} className="py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50" style={{ background: '#7E9B86' }}>Load JSON</button></div>{bulkMessage && <p className="text-[11px] mt-1.5 px-1" style={{ color: bulkMessageIsError ? '#ef4444' : '#7E9B86' }}>{bulkMessage}</p>}</div>}

        {!creating && !editing && (
          <div className="overflow-y-auto px-3 py-3 flex-1"><div className="space-y-1.5">
            {filtered.map(e => {
              const inCatName = assignment[e.id];
              const inTarget = targetCat && targetCat.exerciseIds.includes(e.id);
              const label = originLabel(e);
              return <div key={e.id} className="bg-white rounded-xl border border-stone-100 px-3 py-2 flex items-center gap-2"><button disabled={!addToCatId} onClick={() => addToCatId && onPick(e.id, addToCatId)} className="flex-1 min-w-0 text-left" style={{ cursor: addToCatId ? 'pointer' : 'default' }}><div className="flex items-center gap-1.5"><span className="text-sm font-semibold text-stone-800 truncate">{e.name}</span><span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: label.color, background: label.bg }}>{label.text}</span></div>{e.cue && <p className="text-[11px] text-stone-400 leading-snug truncate">{e.cue}</p>}{inCatName && <p className="text-[10px] text-stone-400 mt-0.5">in {inCatName}</p>}</button>{addToCatId ? <button onClick={() => onPick(e.id, addToCatId)} className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-lg font-bold ${inTarget ? 'bg-red-50 text-red-400 hover:bg-red-100' : 'bg-[#E4ECE6] text-[#7E9B86]'}`} title={inTarget ? 'Remove from this category' : 'Add to this category'}>{inTarget ? '−' : '＋'}</button> : confirmDelete === e.id ? <div className="flex items-center gap-1 flex-shrink-0"><button onClick={() => { onDeleteCustom(e.id); setConfirmDelete(null); }} className="text-[11px] font-bold px-2 py-1 rounded-lg text-white bg-red-500">Delete</button><button onClick={() => setConfirmDelete(null)} className="text-[11px] font-semibold px-2 py-1 rounded-lg text-stone-500 bg-stone-100">No</button></div> : <div className="flex items-center gap-1 flex-shrink-0"><button onClick={() => beginEdit(e)} className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-300 hover:bg-stone-100 hover:text-stone-500" title="Edit exercise">✎</button><button onClick={() => setConfirmDelete(e.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-300 hover:bg-red-50 hover:text-red-500" title="Delete exercise">⌫</button></div>}</div>;
            })}
            {filtered.length === 0 && <p className="text-xs text-stone-400 italic text-center py-6">No exercises match “{query}”.</p>}
          </div></div>
        )}

        {(editing || creating) && <div className="px-3 py-3 border-t border-stone-200 flex-shrink-0">
          {editing ? <div className="bg-white rounded-xl border border-stone-100 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Edit exercise</p>{sourceSearchBox}{formFields}<div className="flex gap-2"><button onClick={submitEdit} className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl" style={{ background: '#7E9B86' }}>Save changes</button><button onClick={resetForm} className="px-4 py-2.5 text-sm text-stone-500 rounded-xl hover:bg-stone-100">Cancel</button></div></div> : <div className="bg-white rounded-xl border border-stone-100 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">New exercise</p>{sourceSearchBox}{formFields}<p className="text-[10px] text-stone-400 -mt-1 mb-2">Source lookup is optional. This button always creates from the fields above.</p><div className="flex gap-2"><button onClick={submitCreate} disabled={!name.trim()} className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-60" style={{ background: importedMeta ? '#7E9B86' : '#C17B4F' }}>{createLabel}</button><button onClick={() => { setCreating(false); resetForm(); }} className="px-4 py-2.5 text-sm text-stone-500 rounded-xl hover:bg-stone-100">Cancel</button></div></div>}
        </div>}
      </div>
    </div>
  );
}
