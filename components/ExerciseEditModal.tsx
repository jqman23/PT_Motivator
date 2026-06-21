'use client';

import { useEffect, useState } from 'react';
import { Exercise } from '@/lib/exercises';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

const ORIGIN_OPTIONS: { value: NonNullable<Exercise['origin']>; label: string }[] = [
  { value: 'hep', label: 'HEP' },
  { value: 'patient_added', label: 'Added' },
  { value: 'exercisedb', label: 'ExerciseDB' },
  { value: 'api_ninjas', label: 'API Ninjas' },
];

function linesToList(value: string) {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
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

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

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
      <div className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()} style={{ maxHeight: '92dvh' }}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Edit exercise</p>
            <h2 className="font-serif text-lg font-semibold text-stone-800 leading-tight truncate">{exercise.name}</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">Saved to exerciseLibrary and used everywhere.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl flex-shrink-0">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-3 flex-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">ID</label>
          <input value={exercise.id} readOnly className="w-full text-xs border border-stone-200 rounded-lg px-3 py-2 mb-2 bg-stone-50 text-stone-400" />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} autoFocus />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Short cue</label>
          <input value={cue} onChange={e => setCue(e.target.value)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Sets / reps</label>
          <input value={sets} onChange={e => setSets(e.target.value)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Category</label>
          <div className="flex gap-2 mb-2">
            {(['mobility', 'strength'] as const).map(value => (
              <button key={value} onClick={() => setCat(value)} className="flex-1 text-xs font-semibold py-2 rounded-lg capitalize" style={{
                background: cat === value ? (value === 'strength' ? '#F4E3D6' : '#E4ECE6') : '#f5f5f4',
                color: cat === value ? (value === 'strength' ? '#C17B4F' : '#7E9B86') : '#a8a29e',
                touchAction: 'manipulation',
              }}>{value}</button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-stone-500 mb-3">
            <input type="checkbox" checked={optional} onChange={e => setOptional(e.target.checked)} />
            Optional exercise
          </label>

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Origin</label>
          <select value={origin} onChange={e => setOrigin(e.target.value as NonNullable<Exercise['origin']>)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }}>
            {ORIGIN_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Source ID</label>
          <input value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">GIF URL</label>
          <input value={gifUrl} onChange={e => setGifUrl(e.target.value)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Media search terms</label>
          <input value={imageSearch} onChange={e => setImageSearch(e.target.value)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Video IDs, one per line</label>
          <textarea value={videoIds} onChange={e => setVideoIds(e.target.value)} rows={3} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none resize-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Video titles, one per line</label>
          <textarea value={videoTitles} onChange={e => setVideoTitles(e.target.value)} rows={3} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none resize-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Instructions / tips, one per line</label>
          <textarea value={tipsText} onChange={e => setTipsText(e.target.value)} rows={5} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-2 focus:outline-none resize-none bg-white" style={{ fontSize: 16, colorScheme: 'light' }} />

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-stone-200 flex gap-2 flex-shrink-0">
          <button onClick={save} disabled={saving || !name.trim()} className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50" style={{ background: '#7E9B86', touchAction: 'manipulation' }}>
            {saving ? 'Saving…' : 'Save exercise'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-stone-500 rounded-xl hover:bg-stone-100" style={{ touchAction: 'manipulation' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
