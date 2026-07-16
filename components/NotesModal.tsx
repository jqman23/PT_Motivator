'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { stripSecretNotes } from '@/lib/secretNotes';
import SecretTextarea from './SecretTextarea';

interface Props {
  exerciseName: string;
  exerciseId: string;
  date: string;
  initialNote: string;
  exerciseSets?: string;
  exerciseCue?: string;
  exerciseTips?: string[];
  onSave: (note: string) => void;
  onClose: () => void;
}

type StandardizedFields = {
  experience?: string;
  symptoms?: string;
  context?: string;
  followUp?: string;
};

type StandardizeResult = {
  originalNote: string;
  standardizedNote: string;
  fields?: StandardizedFields;
  summary?: string[];
  changed?: boolean;
  error?: string;
  detail?: string;
};

type NotePhotoAttachment = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
  note: string;
};

const MAX_PHOTOS = 5;
const MAX_PHOTO_DIMENSION = 1100;
const PHOTO_QUALITY = 0.76;

function cleanLines(value?: string[]) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, 6) : [];
}

function preserveTypedNote(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

function cleanPhotoAttachments(value: unknown): NotePhotoAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<NotePhotoAttachment> => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `photo-${Date.now()}-${index}`,
      name: typeof item.name === 'string' && item.name ? item.name : 'Exercise photo',
      type: typeof item.type === 'string' && item.type ? item.type : 'image/jpeg',
      dataUrl: typeof item.dataUrl === 'string' ? item.dataUrl : '',
      createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
      note: typeof item.note === 'string' ? item.note.slice(0, 500) : '',
    }))
    .filter(item => item.dataUrl.startsWith('data:image/'))
    .slice(0, MAX_PHOTOS);
}

async function readJson(res: Response) {
  const raw = await res.text();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { return { error: 'Non-JSON response', detail: raw.slice(0, 800) }; }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = dataUrl;
  });
}

async function fileToPhotoAttachment(file: File): Promise<NotePhotoAttachment> {
  const originalDataUrl = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(originalDataUrl);
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, width, height);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name || 'Exercise photo',
      type: 'image/jpeg',
      dataUrl: canvas.toDataURL('image/jpeg', PHOTO_QUALITY),
      createdAt: new Date().toISOString(),
      note: '',
    };
  } catch {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name || 'Exercise photo',
      type: file.type || 'image/jpeg',
      dataUrl: originalDataUrl,
      createdAt: new Date().toISOString(),
      note: '',
    };
  }
}

export default function NotesModal({
  exerciseName,
  exerciseId,
  date,
  initialNote,
  exerciseSets = '',
  exerciseCue = '',
  exerciseTips = [],
  onSave,
  onClose,
}: Props) {
  const [note, setNote] = useState(initialNote);
  const [photoAttachments, setPhotoAttachments] = useState<NotePhotoAttachment[]>([]);
  const [loadingStoredNote, setLoadingStoredNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [standardizing, setStandardizing] = useState(false);
  const [standardizeError, setStandardizeError] = useState('');
  const [review, setReview] = useState<StandardizeResult | null>(null);
  const [standardizedNote, setStandardizedNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const fallbackNote = initialNote ?? '';
    setNote(fallbackNote);
    setPhotoAttachments([]);
    setPhotoError('');
    setReview(null);
    setStandardizedNote('');
    setStandardizeError('');
    setLoadingStoredNote(true);

    fetch(`/api/notes?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const stored = rows.find((row: { exercise_id?: string }) => row.exercise_id === exerciseId);
        if (typeof stored?.note === 'string') {
          setNote(stored.note);
          setPhotoAttachments(cleanPhotoAttachments(stored.photo_attachments));
          return;
        }

        // Do not let a stale/missed server fetch erase a note the Home Screen already has.
        setNote(current => current || fallbackNote);
      })
      .catch(() => {
        if (!cancelled) setNote(current => current || fallbackNote);
      })
      .finally(() => {
        if (!cancelled) setLoadingStoredNote(false);
      });

    return () => { cancelled = true; };
  }, [exerciseId, date, initialNote]);

  useEffect(() => {
    fetch(`/api/recent-notes?exerciseId=${encodeURIComponent(exerciseId)}&beforeDate=${date}`)
      .then(r => r.json())
      .then(data => setSuggestions((data.notes ?? []).map((n: string) => stripSecretNotes(n)).filter((n: string) => n.trim())))
      .catch(() => {/* silent */});
  }, [exerciseId, date]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  const saveAndClose = async (value: string) => {
    const cleanNote = preserveTypedNote(value);
    setPhotoError('');
    setSavingNote(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, exerciseId, note: cleanNote, photoAttachments }),
      });
      if (!res.ok) {
        const data = await readJson(res) as { error?: string; detail?: string };
        throw new Error([data.error, data.detail].filter(Boolean).join(': ') || 'Could not save note.');
      }
      onSave(cleanNote);
      onClose();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not save note.');
    } finally {
      setSavingNote(false);
    }
  };

  const handlePhotoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith('image/'));
    event.target.value = '';
    if (files.length === 0) return;

    const remaining = MAX_PHOTOS - photoAttachments.length;
    if (remaining <= 0) {
      setPhotoError(`Maximum ${MAX_PHOTOS} photos per exercise note.`);
      return;
    }

    setPhotoError('Preparing photo…');
    try {
      const converted = await Promise.all(files.slice(0, remaining).map(fileToPhotoAttachment));
      setPhotoAttachments(prev => [...prev, ...converted].slice(0, MAX_PHOTOS));
      setPhotoError(files.length > remaining ? `Added ${remaining}. Maximum ${MAX_PHOTOS} photos per note.` : '');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not attach photo.');
    }
  };

  const removePhoto = (id: string) => {
    setPhotoAttachments(prev => prev.filter(photo => photo.id !== id));
    setPhotoError('');
  };

  const updatePhotoNote = (id: string, value: string) => {
    setPhotoAttachments(prev => prev.map(photo => photo.id === id ? { ...photo, note: value.slice(0, 500) } : photo));
  };

  const handleReview = async () => {
    const rawNote = stripSecretNotes(preserveTypedNote(note));
    if (!rawNote) {
      await saveAndClose('');
      return;
    }

    setStandardizeError('');
    setStandardizing(true);
    try {
      const metricResponse = await fetch(`/api/exercise-metrics?date=${encodeURIComponent(date)}&exerciseId=${encodeURIComponent(exerciseId)}`, { cache: 'no-store' });
      const metricData = metricResponse.ok ? await metricResponse.json() : {};
      const res = await fetch('/api/standardize-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId,
          exerciseName,
          rawNote,
          exerciseSets,
          exerciseCue,
          exerciseTips: cleanLines(exerciseTips),
          recentNotes: suggestions,
          dailyMetric: metricData.current ?? null,
        }),
      });
      const data = await readJson(res) as StandardizeResult;
      if (!res.ok) {
        const detail = [data.error, data.detail].filter(Boolean).join(': ');
        setStandardizeError(detail || 'Could not standardize note. You can still save the original.');
        setReview({ originalNote: rawNote, standardizedNote: data.standardizedNote || rawNote, fields: {}, changed: false });
        setStandardizedNote(data.standardizedNote || rawNote);
        return;
      }
      setReview(data);
      setStandardizedNote(data.standardizedNote || rawNote);
    } catch (err) {
      setStandardizeError(err instanceof Error ? err.message : 'Could not standardize note. You can still save the original.');
      setReview({ originalNote: rawNote, standardizedNote: rawNote, fields: {}, changed: false });
      setStandardizedNote(rawNote);
    } finally {
      setStandardizing(false);
    }
  };

  const applySuggestion = (value: string) => {
    setNote(value);
    setReview(null);
    setStandardizedNote('');
    setStandardizeError('');
  };

  const editOriginal = () => {
    setReview(null);
    setStandardizedNote('');
    setStandardizeError('');
  };

  const renderPhotoGrid = (allowRemove: boolean) => {
    if (photoAttachments.length === 0) return null;
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photoAttachments.map(photo => (
          <div key={photo.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="relative">
              <img src={photo.dataUrl} alt={photo.name || 'Exercise note photo'} className="h-24 w-full object-cover bg-stone-100" />
              {allowRemove && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removePhoto(photo.id); }}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm leading-none text-white"
                  style={{ touchAction: 'manipulation' }}
                  title="Remove photo"
                >
                  ×
                </button>
              )}
            </div>
            {allowRemove ? (
              <textarea
                value={photo.note}
                onChange={(event) => updatePhotoNote(photo.id, event.target.value)}
                placeholder="Photo note"
                rows={2}
                className="block w-full resize-none border-0 border-t border-stone-100 bg-white px-2 py-1.5 text-[11px] leading-snug text-stone-700 outline-none placeholder:text-stone-300"
                maxLength={500}
              />
            ) : photo.note ? (
              <p className="border-t border-stone-100 px-2 py-1.5 text-[10px] leading-snug text-stone-500">{photo.note}</p>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const fields = review?.fields ?? {};
  const fieldChips = [fields.experience, fields.symptoms, fields.context, fields.followUp].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePhotoPick}
        />

        <div className="p-4 border-b border-stone-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-stone-800 text-sm truncate">{exerciseName}</h3>
            <p className="text-xs text-stone-400 mt-0.5">
              Note for {displayDate}{loadingStoredNote ? ' · loading stored note…' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
              className="w-8 h-8 rounded-lg bg-stone-100 text-stone-500 flex items-center justify-center"
              style={{ touchAction: 'manipulation' }}
              title="Attach photo"
            >
              <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M6.2 4.5 7.1 3h3.8l.9 1.5H14a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" />
                <circle cx="9" cy="10" r="2.8" />
              </svg>
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
              className="w-8 h-8 rounded-lg bg-stone-100 text-stone-400 flex items-center justify-center text-xl leading-none"
              style={{ touchAction: 'manipulation' }}
            >×</button>
          </div>
        </div>

        <div className="p-4">
          {suggestions.length > 0 && !review && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                Past templates — tap to reuse/edit
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                {suggestions.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); applySuggestion(s); }}
                    className="flex-shrink-0 text-xs px-3 py-2 rounded-full border transition-colors text-left"
                    style={{
                      borderColor: note === s ? '#7E9B86' : '#e7e5e4',
                      background: note === s ? '#E4ECE6' : '#fafaf9',
                      color: note === s ? '#7E9B86' : '#57534e',
                      maxWidth: 220,
                      touchAction: 'manipulation',
                    }}
                  >
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!review ? (
            <>
              <SecretTextarea
                autoFocus
                value={note}
                onChange={(value) => { setNote(value); setStandardizeError(''); }}
                placeholder="How it felt, pain or symptoms, setup changes, progress, or anything you want to remember."
                className="w-full h-32 text-sm text-stone-700 placeholder-stone-300 border border-stone-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2"
                style={{ fontSize: 16, colorScheme: 'light' }}
                onFocus={(e) => e.currentTarget.style.outlineColor = '#7E9B86'}
              />
              <div className="mt-3 rounded-2xl border border-stone-100 bg-stone-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Photo attachment</p>
                    <p className="text-[11px] text-stone-400 leading-snug mt-0.5">
                      Add a form, setup, swelling, or progress photo to this exercise note.
                    </p>
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
                    disabled={photoAttachments.length >= MAX_PHOTOS}
                    className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap disabled:opacity-40"
                    style={{ background: '#E4ECE6', color: '#476653', touchAction: 'manipulation' }}
                  >
                    📷 Add
                  </button>
                </div>
                {renderPhotoGrid(true)}
                {photoError && <p className="mt-2 text-[11px] text-stone-500 leading-snug">{photoError}</p>}
              </div>
              <p className="mt-2 text-[11px] text-stone-400 leading-snug">
                Save as-is preserves your exact note. Review note cleans up the wording while keeping what you meant.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              {standardizeError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {standardizeError}
                </div>
              )}

              <div className="rounded-2xl border border-stone-100 bg-stone-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Original</p>
                <p className="text-xs text-stone-600 leading-snug" style={{ whiteSpace: 'pre-wrap' }}>{review.originalNote || 'Photo-only note'}</p>
              </div>

              <div className="rounded-2xl border p-3" style={{ borderColor: '#cfded3', background: '#F8FBF8' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#476653' }}>Cleaned note</p>
                <textarea
                  value={standardizedNote}
                  onChange={(e) => setStandardizedNote(e.target.value)}
                  rows={3}
                  className="w-full text-sm resize-none rounded-xl border border-stone-200 px-3 py-2 focus:outline-none bg-white"
                  style={{ fontSize: 16, colorScheme: 'light' }}
                />
                {fieldChips.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {fieldChips.map((chip, i) => (
                      <span key={`${chip}-${i}`} className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: '#E4ECE6', color: '#476653' }}>{chip}</span>
                    ))}
                  </div>
                )}
              </div>

              {photoAttachments.length > 0 && (
                <div className="rounded-2xl border border-stone-100 bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Attached photos</p>
                  {renderPhotoGrid(false)}
                </div>
              )}
              {photoError && <p className="text-[11px] text-stone-500 leading-snug">{photoError}</p>}
            </div>
          )}
        </div>

        <div className="px-3 pb-4 flex flex-nowrap gap-1.5 justify-end overflow-x-auto">
          {!review ? (
            <>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                disabled={savingNote}
                className="px-2 py-2 text-xs text-stone-500 whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                style={{ touchAction: 'manipulation' }}
              >
                Cancel
              </button>
              {(note || photoAttachments.length > 0) && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNote(''); setPhotoAttachments([]); setPhotoError(''); setStandardizeError(''); setReview(null); }}
                  disabled={savingNote}
                  className="px-2 py-2 text-xs font-semibold rounded-xl text-red-500 bg-red-50 whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                  style={{ touchAction: 'manipulation' }}
                >
                  Clear
                </button>
              )}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void saveAndClose(note); }}
                disabled={loadingStoredNote || savingNote}
                className="px-2.5 py-2 text-xs font-bold text-white rounded-xl disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                style={{ background: '#7E9B86', touchAction: 'manipulation' }}
              >
                {savingNote ? 'Saving…' : 'Save as-is'}
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleReview(); }}
                disabled={standardizing || loadingStoredNote || savingNote}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl bg-stone-100 text-stone-600 disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                style={{ touchAction: 'manipulation' }}
              >
                {standardizing ? 'Cleaning up…' : 'Clean up note'}
              </button>
            </>
          ) : (
            <>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editOriginal(); }}
                disabled={savingNote}
                className="px-2 py-2 text-xs text-stone-500 whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                style={{ touchAction: 'manipulation' }}
              >
                Edit original
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void saveAndClose(review.originalNote); }}
                disabled={savingNote}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl bg-stone-100 text-stone-500 whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                style={{ touchAction: 'manipulation' }}
              >
                Keep original
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void saveAndClose(standardizedNote); }}
                disabled={savingNote}
                className="px-2.5 py-2 text-xs font-bold text-white rounded-xl whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                style={{ background: '#7E9B86', touchAction: 'manipulation' }}
              >
                {savingNote ? 'Saving…' : 'Save cleaned'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
