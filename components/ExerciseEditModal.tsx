'use client';

import { useEffect, useMemo, useState } from 'react';
import { Exercise } from '@/lib/exercises';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

type ExercisePatch = Partial<Exercise> & { summary?: string[] };

const ORIGIN_OPTIONS: { value: NonNullable<Exercise['origin']>; label: string }[] = [
  { value: 'hep', label: 'HEP' },
  { value: 'patient_added', label: 'Added' },
  { value: 'exercisedb', label: 'ExerciseDB' },
  { value: 'api_ninjas', label: 'API Ninjas' },
];

function linesToList(value: string) {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

function listToLines(value?: string[]) {
  return (value ?? []).join('\n');
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    name: 'Name',
    cue: 'Short cue',
    sets: 'Sets / reps',
    cat: 'Category',
    optional: 'Optional',
    origin: 'Origin',
    sourceId: 'Source ID',
    gifUrl: 'GIF URL',
    imageSearch: 'Media search terms',
    videoIds: 'Video IDs',
    videoTitles: 'Video titles',
    tips: 'Instructions / tips',
  };
  return labels[key] ?? key;
}

function previewValue(value: unknown) {
  if (Array.isArray(value)) return value.join(' · ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '');
}

export default function ExerciseEditModal({ exercise, onClose }: Props) {
  const [name, setName] = useState(exercise.name);
  const [cue, setCue] = useState(exercise.cue ?? '');
  const [sets, setSets] = useState(exercise.sets ?? '');
  const [cat, setCat] = useState<Exercise['cat']>(exercise.cat);
  const [optional, setOptional] = useState(!!exercise.optional);
  const [origin, setOrigin] = useState<NonNullable<Exercise['origin']>>(exercise.origin ?? 'patient_added');
  const [sourceId, setSourceId] = useState(exercise.sourceId ?? '');
  const [gifUrl, setGifUrl] = useState(exercise.gifUrl ?? '');
  const [imageSearch, setImageSearch] = useState(exercise.imageSearch ?? '');
  const [videoIds, setVideoIds] = useState((exercise.videoIds ?? []).join('\n'));
  const [videoTitles, setVideoTitles] = useState((exercise.videoTitles ?? []).join('\n'));
  const [tipsText, setTipsText] = useState((exercise.tips ?? []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [proposal, setProposal] = useState<ExercisePatch | null>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  const currentDraft = useMemo<Exercise>(() => ({
    ...exercise,
    name,
    cue,
    sets: sets.trim() || undefined,
    cat,
    optional: optional || undefined,
    origin,
    sourceId: sourceId.trim() || undefined,
    gifUrl: gifUrl.trim() || undefined,
    imageSearch: imageSearch.trim() || name.trim(),
    videoIds: linesToList(videoIds),
    videoTitles: linesToList(videoTitles),
    tips: linesToList(tipsText),
  }), [exercise, name, cue, sets, cat, optional, origin, sourceId, gifUrl, imageSearch, videoIds, videoTitles, tipsText]);

  const proposalRows = useMemo(() => {
    if (!proposal) return [];
    return Object.entries(proposal)
      .filter(([key]) => key !== 'summary')
      .filter(([, value]) => value !== undefined && value !== null && previewValue(value).trim() !== '')
      .map(([key, value]) => ({ key, label: fieldLabel(key), value: previewValue(value) }));
  }, [proposal]);

  const askAi = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError('');
    setProposal(null);

    try {
      const res = await fetch('/api/ai-exercise-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: aiText, exercise: currentDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI failed');
      setProposal(data.proposal ?? null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI failed');
    } finally {
      setAiLoading(false);
    }
  };

  const applyProposalToForm = () => {
    if (!proposal) return;
    if (proposal.name !== undefined) setName(proposal.name);
    if (proposal.cue !== undefined) setCue(proposal.cue);
    if (proposal.sets !== undefined) setSets(proposal.sets ?? '');
    if (proposal.cat !== undefined) setCat(proposal.cat);
    if (proposal.optional !== undefined) setOptional(!!proposal.optional);
    if (proposal.origin !== undefined) setOrigin(proposal.origin);
    if (proposal.sourceId !== undefined) setSourceId(proposal.sourceId ?? '');
    if (proposal.gifUrl !== undefined) setGifUrl(proposal.gifUrl ?? '');
    if (proposal.imageSearch !== undefined) setImageSearch(proposal.imageSearch ?? '');
    if (proposal.videoIds !== undefined) setVideoIds(listToLines(proposal.videoIds));
    if (proposal.videoTitles !== undefined) setVideoTitles(listToLines(proposal.videoTitles));
    if (proposal.tips !== undefined) setTipsText(listToLines(proposal.tips));
  };

  const save = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/config?key=exerciseLibrary', { cache: 'no-store' });
      const data = await res.json();
      const library: Exercise[] = Array.isArray(data.value) ? data.value : [];
      const index = library.findIndex(ex => ex.id === exercise.id);

      if (index === -1) {
        setError('This exercise is not in the editable library yet. Open the library once, then try again.');
        return;
      }

      const nextExercise: Exercise = {
        ...library[index],
        name: cleanName,
        cue: cue.trim(),
        sets: sets.trim() || undefined,
        cat,
        optional: optional || undefined,
        origin,
        sourceId: sourceId.trim() || undefined,
        gifUrl: gifUrl.trim() || undefined,
        imageSearch: imageSearch.trim() || cleanName,
        videoIds: linesToList(videoIds),
        videoTitles: linesToList(videoTitles),
        tips: linesToList(tipsText),
      };

      const nextLibrary = library.map(ex => ex.id === exercise.id ? nextExercise : ex);
      const post = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'exerciseLibrary', value: nextLibrary }),
      });

      if (!post.ok) {
        setError('Could not save exercise.');
        return;
      }

      window.location.reload();
    } catch (err) {
      console.error(err);
      setError('Could not save exercise.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8" onClick={onClose}>
      <div
        className="bg-[#F6F1E7] w-[calc(100%-12px)] sm:w-full sm:max-w-md mb-1.5 sm:mb-0 sm:rounded-2xl rounded-3xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '88dvh' }}
      >
        <div className="px-5 py-4 border-b border-stone-200 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Edit exercise</p>
            <h2 className="font-serif text-lg font-semibold text-stone-800 leading-tight truncate">{exercise.name}</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">AI can draft changes. You review before saving.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white hover:bg-stone-100 border border-stone-100 flex items-center justify-center text-stone-500 text-xl flex-shrink-0">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: '#7E9B86' }}>AI</div>
              <div>
                <p className="text-xs font-bold text-stone-700">Describe edits</p>
                <p className="text-[11px] text-stone-400">Preview first. Nothing saves until Save exercise.</p>
              </div>
            </div>
            <textarea
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              placeholder="Example: make this clearer for calf/ankle mobility, add better cue and 3 simple tips"
              rows={3}
              className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none resize-none bg-white"
              style={{ fontSize: 16, colorScheme: 'light' }}
            />
            <button onClick={askAi} disabled={aiLoading || !aiText.trim()} className="mt-2 w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#7E9B86', touchAction: 'manipulation' }}>
              {aiLoading ? 'Drafting…' : 'Preview AI edits'}
            </button>
            {aiError && <p className="mt-2 text-xs font-semibold text-red-600">{aiError}</p>}

            {proposal && (
              <div className="mt-3 rounded-xl border border-[#E4ECE6] bg-[#F8FBF8] p-3">
                {!!proposal.summary?.length && (
                  <ul className="mb-2 space-y-1">
                    {proposal.summary.map((item, idx) => <li key={idx} className="text-[11px] text-stone-600">• {item}</li>)}
                  </ul>
                )}
                {proposalRows.length ? (
                  <div className="space-y-1.5">
                    {proposalRows.map(row => (
                      <div key={row.key} className="bg-white rounded-lg border border-stone-100 px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{row.label}</p>
                        <p className="text-xs text-stone-700 leading-snug mt-0.5">{row.value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-stone-500">AI did not propose field changes.</p>
                )}
                <button onClick={applyProposalToForm} disabled={!proposalRows.length} className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold disabled:opacity-40" style={{ background: '#E4ECE6', color: '#476653', touchAction: 'manipulation' }}>
                  Apply to form
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-stone-100 p-3 shadow-sm space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">ID</label>
            <input value={exercise.id} readOnly className="w-full text-xs border border-stone-200 rounded-xl px-3 py-2.5 bg-stone-50 text-stone-400" />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} autoFocus />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Short cue</label>
            <input value={cue} onChange={e => setCue(e.target.value)} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Sets / reps</label>
            <input value={sets} onChange={e => setSets(e.target.value)} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Category</label>
            <div className="flex gap-2">
              {(['mobility', 'strength'] as const).map(value => (
                <button key={value} onClick={() => setCat(value)} className="flex-1 text-xs font-semibold py-2.5 rounded-xl capitalize" style={{
                  background: cat === value ? (value === 'strength' ? '#F4E3D6' : '#E4ECE6') : '#f5f5f4',
                  color: cat === value ? (value === 'strength' ? '#C17B4F' : '#7E9B86') : '#a8a29e',
                  touchAction: 'manipulation',
                }}>{value}</button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-stone-500 py-1">
              <input type="checkbox" checked={optional} onChange={e => setOptional(e.target.checked)} />
              Optional exercise
            </label>

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Origin</label>
            <select value={origin} onChange={e => setOrigin(e.target.value as NonNullable<Exercise['origin']>)} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }}>
              {ORIGIN_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Source ID</label>
            <input value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">GIF URL</label>
            <input value={gifUrl} onChange={e => setGifUrl(e.target.value)} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Media search terms</label>
            <input value={imageSearch} onChange={e => setImageSearch(e.target.value)} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Video IDs, one per line</label>
            <textarea value={videoIds} onChange={e => setVideoIds(e.target.value)} rows={3} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none resize-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Video titles, one per line</label>
            <textarea value={videoTitles} onChange={e => setVideoTitles(e.target.value)} rows={3} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none resize-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Instructions / tips, one per line</label>
            <textarea value={tipsText} onChange={e => setTipsText(e.target.value)} rows={5} className="w-full text-sm border border-stone-200 rounded-xl px-3 py-3 focus:outline-none resize-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

            {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2">{error}</p>}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-stone-200 flex gap-2 flex-shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button onClick={save} disabled={saving || !name.trim()} className="flex-1 py-3 text-sm font-semibold text-white rounded-xl disabled:opacity-50" style={{ background: '#7E9B86', touchAction: 'manipulation' }}>
            {saving ? 'Saving…' : 'Save exercise'}
          </button>
          <button onClick={onClose} className="px-4 py-3 text-sm font-semibold text-stone-500 rounded-xl bg-white border border-stone-100 hover:bg-stone-50" style={{ touchAction: 'manipulation' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
