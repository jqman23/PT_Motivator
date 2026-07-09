'use client';

import { useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';
import { SmartDbMatch, SmartExerciseChange, SmartHealthChanges, SmartNewExercise, SmartProposal } from '@/components/SmartAddTypes';

type LogMap = Record<string, Record<string, boolean>>;
type NotesMap = Record<string, string>;
type ClarificationOption = { label?: string; value?: string } | string;
type DraftProposal = SmartProposal & { clarificationOptions?: ClarificationOption[] };
type RawProposal = Partial<SmartProposal> & { clarificationOptions?: ClarificationOption[] };

type ApiErrorBody = {
  error?: string;
  detail?: string;
  hint?: string;
  groqStatus?: number;
  groqStatusText?: string;
  model?: string;
  requestId?: string;
  rawModelOutput?: string;
};

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
  source?: 'api_ninjas';
  id?: string;
  name: string;
  type?: string;
  muscle?: string;
  difficulty?: string;
  instructions?: string;
  equipments?: string[];
};

interface Props {
  date: string;
  layout: CategoryConfig[];
  exerciseMap: Record<string, Exercise>;
  log: LogMap;
  notes: NotesMap;
  onClose: () => void;
  onApply: (proposal: SmartProposal, previousHealth: SmartHealthChanges | null, nextHealth: SmartHealthChanges | null) => Promise<void>;
}

const NUMERIC_HEALTH = ['sleep_hours', 'sleep_quality', 'energy', 'mood', 'pain'];
const HEALTH_LABELS: Record<string, string> = {
  sleep_hours: 'Sleep hours',
  sleep_quality: 'Sleep quality',
  energy: 'Energy',
  mood: 'Mood',
  pain: 'Pain',
  sleep_notes: 'Sleep duration notes',
  sleep_quality_notes: 'Sleep quality notes',
  energy_notes: 'Energy notes',
  mood_notes: 'Mood notes',
  pain_notes: 'Pain notes',
  treatment_notes: 'Meds / treatments',
  general_notes: 'General notes',
};

function normalizeHealth(row: SmartHealthChanges | null): SmartHealthChanges | null {
  if (!row) return null;
  const out: SmartHealthChanges = {};
  for (const key of [...NUMERIC_HEALTH, 'sleep_notes', 'sleep_quality_notes', 'energy_notes', 'mood_notes', 'pain_notes', 'treatment_notes', 'general_notes']) {
    out[key] = row[key] ?? (NUMERIC_HEALTH.includes(key) ? null : '');
  }
  return out;
}

function sameNote(a: unknown, b: unknown) {
  return String(a ?? '').trim() === String(b ?? '').trim();
}

function sameHealthValue(key: string, oldValue: unknown, newValue: unknown) {
  if (NUMERIC_HEALTH.includes(key)) {
    const oldBlank = oldValue === null || oldValue === undefined || oldValue === '';
    const newBlank = newValue === null || newValue === undefined || newValue === '';
    if (oldBlank && newBlank) return true;
    return Number(oldValue) === Number(newValue);
  }
  return sameNote(oldValue, newValue);
}

function linesToList(value: string) {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

function listToLines(value?: string[]) {
  return (value ?? []).join('\n');
}

function optionLabel(option: ClarificationOption) {
  return typeof option === 'string' ? option : String(option.label ?? option.value ?? '').trim();
}

function optionValue(option: ClarificationOption) {
  return typeof option === 'string' ? option : String(option.value ?? option.label ?? '').trim();
}

async function readResponseJson(res: Response) {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: 'Server returned non-JSON response', detail: raw.slice(0, 1200) };
  }
}

function formatApiError(data: ApiErrorBody, res: Response) {
  const lines = [data.error || `Request failed (${res.status})`];
  const status = data.groqStatus || res.status;
  const statusText = data.groqStatusText || res.statusText;
  if (status) lines.push(`Status: ${status}${statusText ? ` ${statusText}` : ''}`);
  if (data.model) lines.push(`Model: ${data.model}`);
  if (data.hint) lines.push(`Hint: ${data.hint}`);
  if (data.detail) lines.push(`Detail: ${data.detail}`);
  if (data.rawModelOutput) lines.push(`Raw model output: ${data.rawModelOutput}`);
  if (data.requestId) lines.push(`Request ID: ${data.requestId}`);
  return lines.filter(Boolean).join('\n');
}

function toTitleCase(value: string) {
  return value.replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function normalizeExerciseDbMatch(item: ExerciseDbResult): SmartDbMatch {
  const target = item.targetMuscles?.join(', ') ?? '';
  const equipment = item.equipments?.join(', ') ?? '';
  return {
    source: 'exercisedb',
    sourceId: item.exerciseId,
    name: toTitleCase(item.name),
    cue: [target, equipment].filter(Boolean).join(' · '),
    tips: item.instructions?.slice(0, 5),
    gifUrl: item.gifUrl,
    label: 'ExerciseDB',
  };
}

function normalizeApiNinjasMatch(item: ApiNinjasResult, index: number): SmartDbMatch {
  return {
    source: 'api_ninjas',
    sourceId: item.name || item.id || `api-ninjas-${index}`,
    name: toTitleCase(item.name),
    cue: [item.type, item.muscle, item.difficulty].filter(Boolean).join(' · '),
    tips: item.instructions ? [item.instructions] : [],
    label: 'API Ninjas',
  };
}

async function searchExternalSources(search: string): Promise<SmartDbMatch[]> {
  if (search.trim().length < 2) return [];
  const lower = search.toLowerCase();
  const queryHints = new Set([search.trim()]);
  if (/(elevated|step|stairs?|ledge|box|surface|platform).*(leg|heel|calf|ankle|foot|up|down)|(?:leg|heel|calf|ankle|foot|up|down).*(elevated|step|stairs?|ledge|box|surface|platform)/i.test(lower)) {
    queryHints.add('single leg calf raise step');
    queryHints.add('eccentric heel drop');
    queryHints.add('single leg heel raise');
  }
  if (/(toe|heel).*(raise|lift)|calf.*raise|plantar/i.test(lower)) queryHints.add('calf raise');
  if (/(nerve|floss|glide|sciatic|slump)/i.test(lower)) queryHints.add('sciatic nerve glide');
  if (/(balance|unstable|foam|cushion|pillow|single leg stand)/i.test(lower)) queryHints.add('single leg balance');
  if (/(band|theraband).*(ankle|foot).*(in|out|side|eversion|inversion)/i.test(lower)) queryHints.add('ankle eversion inversion band');

  const searches = Array.from(queryHints).slice(0, 4);
  const responses = await Promise.all(searches.map(term => Promise.all([
    fetch(`/api/exercisedb/search?search=${encodeURIComponent(term)}`).then(r => r.json()).catch(() => ({ success: false, data: [] })),
    fetch(`/api/api-ninjas/exercises?search=${encodeURIComponent(term)}`).then(r => r.json()).catch(() => ({ success: false, data: [] })),
  ])));

  const seen = new Set<string>();
  const matches: SmartDbMatch[] = [];
  responses.forEach(([exerciseDbRes, apiNinjasRes]) => {
    const exerciseDbMatches: SmartDbMatch[] = Array.isArray(exerciseDbRes.data)
      ? exerciseDbRes.data.slice(0, 4).map((item: ExerciseDbResult) => normalizeExerciseDbMatch(item))
      : [];
    const apiNinjasMatches: SmartDbMatch[] = Array.isArray(apiNinjasRes.data)
      ? apiNinjasRes.data.slice(0, 4).map((item: ApiNinjasResult, index: number) => normalizeApiNinjasMatch(item, index))
      : [];
    [...exerciseDbMatches, ...apiNinjasMatches].forEach(match => {
      const key = `${match.source}-${match.sourceId || match.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      matches.push(match);
    });
  });

  return matches.slice(0, 10);
}

function parseJsonFromText(text: string) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(jsonMatch ? jsonMatch[1] : text.trim());
}

export default function AIQuickAddModal({ date, layout, exerciseMap, log, notes, onClose, onApply }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<DraftProposal | null>(null);
  const [currentHealth, setCurrentHealth] = useState<SmartHealthChanges | null>(null);
  const [manualExerciseId, setManualExerciseId] = useState('');
  const [manualNote, setManualNote] = useState('');

  const categoryNames = useMemo(() => layout.map(cat => cat.name), [layout]);

  const visibleExercises = useMemo(() => layout.flatMap(cat =>
    cat.exerciseIds
      .map(id => exerciseMap[id])
      .filter(Boolean)
      .map(ex => ({
        id: ex.id,
        name: ex.name,
        category: cat.name,
        sets: ex.sets ?? '',
        cue: ex.cue ?? '',
        tips: Array.isArray(ex.tips) ? ex.tips : [],
        done: !!log[date]?.[ex.id],
        note: notes[ex.id] ?? '',
      }))
  ), [layout, exerciseMap, log, notes, date]);

  const loadHealth = async () => {
    const res = await fetch(`/api/health?date=${date}`);
    const data = await res.json();
    const row = data.row ? normalizeHealth(data.row) : null;
    setCurrentHealth(row);
    return row;
  };

  const compactProposal = (raw: RawProposal, health: SmartHealthChanges | null): DraftProposal => {
    const exerciseChanges: SmartExerciseChange[] = (raw.exerciseChanges ?? [])
      .map((change: SmartExerciseChange) => {
        const currentDone = !!log[date]?.[change.id];
        const currentNote = notes[change.id] ?? '';
        const next: SmartExerciseChange = { id: change.id, reason: change.reason };
        if (typeof change.completed === 'boolean' && change.completed !== currentDone) next.completed = change.completed;
        if (change.note !== undefined && change.note !== null && !sameNote(change.note, currentNote)) next.note = String(change.note).trim();
        return next;
      })
      .filter((change: SmartExerciseChange) => typeof change.completed === 'boolean' || change.note !== undefined);

    const healthChanges: SmartHealthChanges = {};
    Object.entries(raw.healthChanges ?? {}).forEach(([key, value]) => {
      if (!sameHealthValue(key, health?.[key], value)) healthChanges[key] = value as string | number | null;
    });

    const newExercises: SmartNewExercise[] = (raw.newExercises ?? [])
      .map((item: SmartNewExercise) => ({
        name: String(item.name ?? '').trim(),
        categoryName: categoryNames.includes(item.categoryName ?? '') ? item.categoryName : categoryNames[0],
        sets: String(item.sets ?? '').trim(),
        cue: String(item.cue ?? '').trim(),
        tips: Array.isArray(item.tips) ? item.tips.map(tip => String(tip).trim()).filter(Boolean).slice(0, 6) : [],
        note: String(item.note ?? '').trim(),
        completed: typeof item.completed === 'boolean' ? item.completed : null,
        reason: String(item.reason ?? '').trim(),
        origin: item.origin,
        sourceId: item.sourceId,
        gifUrl: item.gifUrl,
        dbMatches: Array.isArray(item.dbMatches) ? item.dbMatches.slice(0, 3) : [],
      }))
      .filter((item: SmartNewExercise) => item.name);

    const clarificationOptions = Array.isArray(raw.clarificationOptions)
      ? raw.clarificationOptions
          .map((item: ClarificationOption) => {
            const label = optionLabel(item);
            const value = optionValue(item);
            return label ? { label, value: value || label } : null;
          })
          .filter(Boolean)
          .slice(0, 3) as ClarificationOption[]
      : [];

    return {
      summary: raw.summary ?? [],
      exerciseChanges,
      newExercises,
      healthChanges,
      questions: raw.questions ?? [],
      clarificationOptions,
    };
  };

  const proposalFromImport = (raw: unknown): RawProposal => {
    const parsed = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const rawExercises = Array.isArray(raw)
      ? raw
      : Array.isArray(parsed.exercises)
        ? parsed.exercises
        : Array.isArray(parsed.newExercises)
          ? parsed.newExercises
          : parsed.name
            ? [parsed]
            : [];
    return {
      summary: Array.isArray(parsed.summary) ? parsed.summary as string[] : ['Imported from JSON'],
      exerciseChanges: Array.isArray(parsed.exerciseChanges) ? parsed.exerciseChanges as SmartExerciseChange[] : [],
      newExercises: rawExercises.map(item => {
        const ex = item as Record<string, unknown>;
        return {
          name: String(ex.name ?? ex.exerciseName ?? '').trim(),
          categoryName: String(ex.categoryName ?? ex.category ?? categoryNames[0] ?? '').trim(),
          sets: String(ex.sets ?? ex.dosage ?? ex.prescription ?? '').trim(),
          cue: String(ex.cue ?? ex.instructions ?? ex.setup ?? '').trim(),
          tips: Array.isArray(ex.tips) ? ex.tips.map(tip => String(tip).trim()).filter(Boolean) : [],
          note: String(ex.note ?? '').trim(),
          completed: typeof ex.completed === 'boolean' ? ex.completed : null,
          reason: String(ex.reason ?? 'Imported from JSON').trim(),
          origin: 'patient_added' as const,
        };
      }).filter(item => item.name),
      healthChanges: parsed.healthChanges && typeof parsed.healthChanges === 'object' ? parsed.healthChanges as SmartHealthChanges : {},
      questions: Array.isArray(parsed.questions) ? parsed.questions as string[] : [],
      clarificationOptions: [],
    };
  };

  const loadJsonFromInput = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError('');
    setLoading(true);
    try {
      const [parsed, health] = await Promise.all([Promise.resolve(parseJsonFromText(text)), loadHealth()]);
      const draft = compactProposal(proposalFromImport(parsed), health);
      if (!draft.newExercises.length && !draft.exerciseChanges.length && !Object.keys(draft.healthChanges || {}).length) {
        throw new Error('No exercises or changes found in pasted JSON.');
      }
      setProposal(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse JSON from the text window');
    } finally {
      setLoading(false);
    }
  };

  const analyze = async (overrideText?: string, overrideDraft?: DraftProposal | null) => {
    const textToAnalyze = (overrideText ?? input).trim();
    if (!textToAnalyze) return;
    setError('');
    setLoading(true);
    try {
      const [health, sourceMatches] = await Promise.all([
        loadHealth(),
        searchExternalSources(textToAnalyze),
      ]);
      const compactExercises = visibleExercises.slice(0, 45).map(ex => ({
        id: ex.id,
        name: ex.name,
        category: ex.category,
        sets: ex.sets,
        cue: ex.cue,
        done: ex.done,
        note: ex.note,
      }));
      const draftForRevision = overrideDraft ?? proposal;
      const res = await fetch('/api/ai-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToAnalyze, exercises: compactExercises, health: health ?? {}, draftProposal: draftForRevision, sourceMatches: sourceMatches.slice(0, 5), date }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(formatApiError(data, res));
      setProposal(compactProposal(data, health));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI failed');
    } finally {
      setLoading(false);
    }
  };

  const chooseClarification = (option: ClarificationOption) => {
    const choice = optionValue(option) || optionLabel(option);
    if (!choice) return;
    const nextInput = `${input.trim()}\n\nClarification selected: ${choice}`.trim();
    setInput(nextInput);
    void analyze(nextInput, proposal);
  };

  const ensureProposal = () => {
    const draft: DraftProposal = proposal ?? {
      summary: [],
      exerciseChanges: [],
      newExercises: [],
      healthChanges: {},
      questions: [],
      clarificationOptions: [],
    };
    return draft;
  };

  const addManualNote = () => {
    if (!manualExerciseId || !manualNote.trim()) return;
    const draft = ensureProposal();
    const existingIndex = draft.exerciseChanges.findIndex(change => change.id === manualExerciseId);
    const nextChange: SmartExerciseChange = {
      ...(existingIndex >= 0 ? draft.exerciseChanges[existingIndex] : { id: manualExerciseId }),
      note: manualNote.trim(),
      reason: 'Manual note',
    };
    const nextChanges = existingIndex >= 0
      ? draft.exerciseChanges.map((change, idx) => idx === existingIndex ? nextChange : change)
      : [...draft.exerciseChanges, nextChange];
    setProposal({ ...draft, exerciseChanges: nextChanges });
    setManualNote('');
  };

  const addManualExerciseDraft = () => {
    const draft = ensureProposal();
    setProposal({
      ...draft,
      newExercises: [
        ...draft.newExercises,
        {
          name: '',
          categoryName: categoryNames[0] ?? '',
          sets: '',
          cue: '',
          tips: [],
          note: '',
          completed: null,
          reason: 'Manual exercise',
          origin: 'patient_added',
        },
      ],
    });
  };

  const updateExercise = (idx: number, patch: Partial<SmartExerciseChange>) => {
    if (!proposal) return;
    const next = [...proposal.exerciseChanges];
    next[idx] = { ...next[idx], ...patch };
    setProposal({ ...proposal, exerciseChanges: next });
  };

  const removeExercise = (idx: number) => {
    if (!proposal) return;
    setProposal({ ...proposal, exerciseChanges: proposal.exerciseChanges.filter((_, i) => i !== idx) });
  };

  const updateNewExercise = (idx: number, patch: Partial<SmartNewExercise>) => {
    if (!proposal) return;
    const next = [...proposal.newExercises];
    next[idx] = { ...next[idx], ...patch };
    setProposal({ ...proposal, newExercises: next });
  };

  const removeNewExercise = (idx: number) => {
    if (!proposal) return;
    setProposal({ ...proposal, newExercises: proposal.newExercises.filter((_, i) => i !== idx) });
  };

  const updateHealth = (key: string, value: string) => {
    if (!proposal) return;
    const parsed = NUMERIC_HEALTH.includes(key) ? (value === '' ? null : Number(value)) : value;
    setProposal({ ...proposal, healthChanges: { ...proposal.healthChanges, [key]: parsed } });
  };

  const apply = async () => {
    if (!proposal) return;
    const cleanedProposal: SmartProposal = {
      ...proposal,
      newExercises: proposal.newExercises.filter(item => item.name.trim()),
      exerciseChanges: proposal.exerciseChanges.filter(change => change.id && (typeof change.completed === 'boolean' || change.note !== undefined)),
    };
    setSaving(true);
    try {
      const hasHealth = Object.keys(cleanedProposal.healthChanges || {}).length > 0;
      const nextHealth = hasHealth ? { ...(currentHealth ?? {}), ...cleanedProposal.healthChanges } : null;
      await onApply(cleanedProposal, currentHealth, nextHealth);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const clarificationOptions = proposal?.clarificationOptions ?? [];
  const hasOptions = clarificationOptions.length > 0;
  const hasChanges = !!proposal && (proposal.exerciseChanges.length > 0 || proposal.newExercises.some(item => item.name.trim()) || Object.keys(proposal.healthChanges || {}).length > 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()} style={{ maxHeight: '92dvh' }}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">AI add</h2>
            <p className="text-[11px] text-stone-400">Describe what happened, paste JSON, or create manually. Review before saving.</p>
          </div>
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 p-3">
            <textarea
              value={input}
              onChange={e => { setInput(e.target.value); setError(''); }}
              placeholder="Examples: Split seated mobility into 3 specific exercises. Or paste JSON here, then tap Load JSON."
              rows={5}
              className="w-full text-sm resize-none rounded-xl border border-stone-200 px-3 py-2.5 focus:outline-none bg-white"
              style={{ fontSize: 16, colorScheme: 'light' }}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); void analyze(); }} disabled={loading || !input.trim()} className="py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#7E9B86' }}>
                {loading ? 'Working…' : proposal ? 'Review update' : 'Review changes'}
              </button>
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); void loadJsonFromInput(); }} disabled={loading || !input.trim()} className="py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#1F2F46' }}>
                Load JSON
              </button>
            </div>
            <p className="mt-1 text-[11px] text-stone-400">Use the same box for normal AI text or JSON. Load JSON skips AI and turns the pasted JSON into a reviewable draft.</p>

            <div className="mt-3 grid gap-2 rounded-xl border border-stone-100 bg-stone-50 p-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Skip AI when you already know what to add</p>
              <div className="flex gap-1.5">
                <select value={manualExerciseId} onChange={e => setManualExerciseId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-2 text-xs" style={{ fontSize: 16, colorScheme: 'light' }}>
                  <option value="">Choose exercise for note…</option>
                  {visibleExercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
                <button onClick={e => { e.preventDefault(); e.stopPropagation(); addManualNote(); }} disabled={!manualExerciseId || !manualNote.trim()} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40" style={{ background: '#5B9BD5' }}>Add note</button>
              </div>
              <textarea value={manualNote} onChange={e => setManualNote(e.target.value)} placeholder="Manual note exactly as you want it saved…" rows={2} className="w-full resize-none rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} />
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); addManualExerciseDraft(); }} className="w-full rounded-xl border-2 border-dashed border-stone-300 py-2 text-xs font-bold text-stone-500 hover:border-stone-400 hover:text-stone-700">＋ Manual exercise (no database / no AI label)</button>
            </div>
            {error && (
              <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2">
                <p className="text-xs font-bold text-red-700 mb-1">AI add failed</p>
                <pre className="text-[11px] leading-snug text-red-700 whitespace-pre-wrap font-sans">{error}</pre>
              </div>
            )}
          </div>

          {proposal && (
            <>
              {!!proposal.questions?.length && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                  <p className="text-xs font-bold text-amber-800 mb-1">AI was unsure</p>
                  <ul className="space-y-1 mb-2">{proposal.questions.map((q, i) => <li key={i} className="text-xs text-amber-700">• {q}</li>)}</ul>
                  {hasOptions && (
                    <div className="space-y-1.5">
                      {clarificationOptions.map((option, i) => {
                        const label = optionLabel(option);
                        const value = optionValue(option);
                        const hasPreview = value && value !== label;
                        return (
                          <button key={`${label}-${i}`} onClick={e => { e.preventDefault(); e.stopPropagation(); chooseClarification(option); }} disabled={loading}
                            className="w-full text-left rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs disabled:opacity-50">
                            <span className="font-bold text-amber-800">{label}</span>
                            {hasPreview && <span className="block mt-0.5 text-amber-700 font-normal leading-snug opacity-80">{value}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!!proposal.summary?.length && (
                <div className="bg-white rounded-2xl border border-stone-100 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Summary</p>
                  <ul className="space-y-1">{proposal.summary.map((item, i) => <li key={i} className="text-xs text-stone-600">• {item}</li>)}</ul>
                </div>
              )}

              {!hasChanges && !hasOptions && (
                <div className="bg-white rounded-2xl border border-stone-100 p-3 text-center">
                  <p className="text-sm font-bold text-stone-700">No new changes found</p>
                  <p className="text-xs text-stone-400 mt-1">Already-completed fields and unchanged notes are hidden.</p>
                </div>
              )}

              {!!proposal.newExercises.length && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">New exercises</p>
                  {proposal.newExercises.map((item, idx) => (
                    <div key={`${item.sourceId ?? item.origin ?? 'new'}-${idx}`} className="bg-white rounded-2xl border-2 p-3" style={{ borderColor: '#cfded3' }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mb-1" style={{ background: item.origin === 'exercisedb' ? '#ede9fe' : item.origin === 'api_ninjas' || item.origin === 'patient_added' ? '#dbeafe' : '#E4ECE6', color: item.origin === 'exercisedb' ? '#7C3AED' : item.origin === 'api_ninjas' || item.origin === 'patient_added' ? '#2f6f9f' : '#476653' }}>{item.origin === 'exercisedb' ? 'ExerciseDB' : item.origin === 'api_ninjas' ? 'API Ninjas' : item.origin === 'patient_added' ? 'Manual' : 'AI draft'}</span>
                          <input value={item.name} onChange={e => updateNewExercise(idx, { name: e.target.value })} className="block w-full text-sm font-bold text-stone-800 bg-transparent border-b border-stone-200 focus:outline-none" style={{ fontSize: 16 }} />
                        </div>
                        <button onClick={e => { e.preventDefault(); e.stopPropagation(); removeNewExercise(idx); }} className="text-xs text-stone-400">Remove</button>
                      </div>
                      <select value={item.categoryName ?? categoryNames[0] ?? ''} onChange={e => updateNewExercise(idx, { categoryName: e.target.value })} className="mb-2 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm bg-white" style={{ fontSize: 16 }}>
                        {categoryNames.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                      <input value={item.sets ?? ''} onChange={e => updateNewExercise(idx, { sets: e.target.value })} placeholder="Sets/reps/time" className="mb-2 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm" style={{ fontSize: 16 }} />
                      <textarea value={item.cue ?? ''} onChange={e => updateNewExercise(idx, { cue: e.target.value })} placeholder="Cue / instructions" rows={2} className="mb-2 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm resize-none" style={{ fontSize: 16 }} />
                      <textarea value={listToLines(item.tips)} onChange={e => updateNewExercise(idx, { tips: linesToList(e.target.value) })} placeholder="Tips, one per line" rows={3} className="mb-2 w-full rounded-lg border border-stone-200 px-2 py-2 text-sm resize-none" style={{ fontSize: 16 }} />
                      <textarea value={item.note ?? ''} onChange={e => updateNewExercise(idx, { note: e.target.value })} placeholder="Optional note for today" rows={2} className="w-full rounded-lg border border-stone-200 px-2 py-2 text-sm resize-none" style={{ fontSize: 16 }} />
                    </div>
                  ))}
                </div>
              )}

              {!!proposal.exerciseChanges.length && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Exercise updates</p>
                  {proposal.exerciseChanges.map((change, idx) => {
                    const ex = exerciseMap[change.id];
                    const oldNote = notes[change.id] ?? '';
                    const noteChanged = change.note != null && change.note !== oldNote;
                    return (
                      <div key={`${change.id}-${idx}`} className="bg-white rounded-2xl border border-stone-100 p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mb-1" style={{ background: '#FBF5E8', color: '#B8883A' }}>Update</span>
                            <p className="text-sm font-bold text-stone-800">{ex?.name ?? change.id}</p>
                            {change.reason && <p className="text-[11px] text-stone-400">{change.reason}</p>}
                          </div>
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); removeExercise(idx); }} className="text-xs text-stone-400">Remove</button>
                        </div>
                        <div className="flex gap-2 mb-2">
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); updateExercise(idx, { completed: true }); }} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: change.completed === true ? '#E4ECE6' : '#f5f5f4', color: change.completed === true ? '#476653' : '#78716c' }}>Done</button>
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); updateExercise(idx, { completed: false }); }} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: change.completed === false ? '#fee2e2' : '#f5f5f4', color: change.completed === false ? '#991b1b' : '#78716c' }}>Not done</button>
                        </div>
                        {noteChanged && oldNote && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-2">Replacing note: {oldNote}</p>}
                        <textarea value={change.note ?? ''} onChange={e => updateExercise(idx, { note: e.target.value })} placeholder="Optional note…" rows={2} className="w-full text-sm resize-none rounded-xl border border-stone-200 px-3 py-2 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {!!Object.keys(proposal.healthChanges || {}).length && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Health / general updates</p>
                  {Object.entries(proposal.healthChanges).map(([key, value]) => {
                    const oldValue = currentHealth?.[key] ?? '';
                    const changed = String(oldValue ?? '') !== String(value ?? '');
                    return (
                      <div key={key} className="bg-white rounded-xl border border-stone-100 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-stone-700">{HEALTH_LABELS[key] ?? key}</label>
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: oldValue !== '' && oldValue != null ? '#FBF5E8' : '#E4ECE6', color: oldValue !== '' && oldValue != null ? '#B8883A' : '#476653' }}>{oldValue !== '' && oldValue != null ? 'Update' : 'Add'}</span>
                        </div>
                        {changed && oldValue !== '' && oldValue != null && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-2">Replacing: {String(oldValue)}</p>}
                        {NUMERIC_HEALTH.includes(key) ? (
                          <input type="number" value={value == null ? '' : String(value)} onChange={e => updateHealth(key, e.target.value)} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" style={{ fontSize: 16, colorScheme: 'light' }} />
                        ) : (
                          <textarea value={value == null ? '' : String(value)} onChange={e => updateHealth(key, e.target.value)} rows={2} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm resize-none" style={{ fontSize: 16, colorScheme: 'light' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={e => { e.preventDefault(); e.stopPropagation(); apply(); }} disabled={saving || !hasChanges} className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#5B9BD5' }}>
                {saving ? 'Saving…' : 'Save these changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
