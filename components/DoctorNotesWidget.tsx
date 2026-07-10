'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

type DoctorNotePhoto = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
};

type DoctorNote = {
  id: string;
  kind: string;
  title: string;
  provider: string;
  referenceText: string;
  body: string;
  linkedDates: string[];
  photoAttachments: DoctorNotePhoto[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

interface Props {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const MAX_PHOTOS = 5;
const MAX_PHOTO_DIMENSION = 1100;
const PHOTO_QUALITY = 0.76;

const NOTE_TYPES = [
  { value: 'question', label: 'Question for doctor' },
  { value: 'symptom', label: 'Symptom / pattern' },
  { value: 'visit', label: 'Visit note' },
  { value: 'result', label: 'Diagnosis / test result' },
  { value: 'plan', label: 'Plan / instruction' },
];

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function displayDate(value: string) {
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizePhoto(value: unknown, index: number): DoctorNotePhoto | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DoctorNotePhoto>;
  if (typeof raw.dataUrl !== 'string' || !raw.dataUrl.startsWith('data:image/')) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `photo-${Date.now()}-${index}`,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Doctor note photo',
    type: typeof raw.type === 'string' && raw.type ? raw.type : 'image/jpeg',
    dataUrl: raw.dataUrl,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  };
}

function normalizeRow(value: unknown): DoctorNote | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  if (!id) return null;
  return {
    id,
    kind: typeof row.kind === 'string' ? row.kind : 'question',
    title: typeof row.title === 'string' ? row.title : '',
    provider: typeof row.provider === 'string' ? row.provider : '',
    referenceText: typeof row.reference_text === 'string' ? row.reference_text : typeof row.referenceText === 'string' ? row.referenceText : '',
    body: typeof row.body === 'string' ? row.body : '',
    linkedDates: Array.isArray(row.linked_dates)
      ? row.linked_dates.filter((date): date is string => typeof date === 'string')
      : Array.isArray(row.linkedDates) ? row.linkedDates.filter((date): date is string => typeof date === 'string') : [],
    photoAttachments: (Array.isArray(row.photo_attachments) ? row.photo_attachments : Array.isArray(row.photoAttachments) ? row.photoAttachments : [])
      .map(normalizePhoto)
      .filter((photo): photo is DoctorNotePhoto => Boolean(photo))
      .slice(0, MAX_PHOTOS),
    pinned: row.pinned === true,
    createdAt: typeof row.created_at === 'string' ? row.created_at : typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
  };
}

function blankNote(selectedDate: string): DoctorNote {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    kind: 'question',
    title: '',
    provider: '',
    referenceText: '',
    body: '',
    linkedDates: selectedDate ? [selectedDate] : [],
    photoAttachments: [],
    pinned: true,
    createdAt: now,
    updatedAt: now,
  };
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

async function fileToPhoto(file: File): Promise<DoctorNotePhoto> {
  const original = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      id: makeId(),
      name: file.name || 'Doctor note photo',
      type: 'image/jpeg',
      dataUrl: canvas.toDataURL('image/jpeg', PHOTO_QUALITY),
      createdAt: new Date().toISOString(),
    };
  } catch {
    return {
      id: makeId(),
      name: file.name || 'Doctor note photo',
      type: file.type || 'image/jpeg',
      dataUrl: original,
      createdAt: new Date().toISOString(),
    };
  }
}

function noteTypeLabel(kind: string) {
  return NOTE_TYPES.find(type => type.value === kind)?.label ?? 'Doctor note';
}

function copyText(note: DoctorNote) {
  return [
    note.title || noteTypeLabel(note.kind),
    note.provider ? `Provider: ${note.provider}` : '',
    note.referenceText ? `Reference: ${note.referenceText}` : '',
    note.linkedDates.length ? `Related dates: ${note.linkedDates.map(displayDate).join(', ')}` : '',
    note.body,
  ].filter(Boolean).join('\n');
}

export default function DoctorNotesWidget({ selectedDate, onSelectDate }: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [draft, setDraft] = useState<DoctorNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dateToAdd, setDateToAdd] = useState(selectedDate);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<DoctorNotePhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadNotes = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/doctor-notes', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load doctor notes.');
      setNotes((Array.isArray(data.rows) ? data.rows : []).map(normalizeRow).filter((row): row is DoctorNote => Boolean(row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load doctor notes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadNotes();
  }, [open]);

  useEffect(() => {
    setDateToAdd(selectedDate);
  }, [selectedDate]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter(note => [note.title, note.provider, note.referenceText, note.body, noteTypeLabel(note.kind), ...note.linkedDates]
      .join(' ')
      .toLowerCase()
      .includes(query));
  }, [notes, search]);

  const startNew = () => {
    setDraft(blankNote(selectedDate));
    setDateToAdd(selectedDate);
    setConfirmDelete(false);
    setError('');
  };

  const editNote = (note: DoctorNote) => {
    setDraft({ ...note, linkedDates: [...note.linkedDates], photoAttachments: [...note.photoAttachments] });
    setDateToAdd(selectedDate);
    setConfirmDelete(false);
    setError('');
  };

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/doctor-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save doctor note.');
      const saved = normalizeRow(data.row);
      if (saved) setNotes(prev => [saved, ...prev.filter(note => note.id !== saved.id)].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save doctor note.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = async () => {
    if (!draft) return;
    if (!notes.some(note => note.id === draft.id)) {
      setDraft(null);
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/doctor-notes?id=${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete doctor note.');
      setNotes(prev => prev.filter(note => note.id !== draft.id));
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete doctor note.');
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const addDate = (value: string) => {
    if (!draft || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setDraft({ ...draft, linkedDates: Array.from(new Set([...draft.linkedDates, value])).sort() });
  };

  const handlePhotoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!draft) return;
    const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith('image/'));
    event.target.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - draft.photoAttachments.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_PHOTOS} photos per note.`);
      return;
    }
    setPreparingPhotos(true);
    setError('');
    try {
      const photos = await Promise.all(files.slice(0, remaining).map(fileToPhoto));
      setDraft(current => current ? { ...current, photoAttachments: [...current.photoAttachments, ...photos].slice(0, MAX_PHOTOS) } : current);
      if (files.length > remaining) setError(`Added ${remaining}. Maximum ${MAX_PHOTOS} photos per note.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach photo.');
    } finally {
      setPreparingPhotos(false);
    }
  };

  const copyNote = async (note: DoctorNote) => {
    try {
      await navigator.clipboard.writeText(copyText(note));
      setError('Copied to clipboard.');
      setTimeout(() => setError(''), 1400);
    } catch {
      setError('Could not copy note.');
    }
  };

  const openDay = (date: string) => {
    onSelectDate(date);
    setOpen(false);
    setDraft(null);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-9 h-9 rounded-xl border flex flex-col items-center justify-center gap-0.5 shadow-sm flex-shrink-0 transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
        style={{ touchAction: 'manipulation', background: 'white', borderColor: '#e7e5e4', color: '#78716c' }}
        title="Doctor notes"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M5 2.5h7l3 3V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
          <path d="M12 2.5V6h3M7 10h6M7 13h4" />
        </svg>
        <span style={{ fontSize: '6.5px', lineHeight: 1, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.85 }}>doc</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-6" onClick={() => { setOpen(false); setDraft(null); }}>
          <div className="flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-[#F6F1E7] shadow-2xl sm:max-w-lg sm:rounded-3xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <div>
                <h2 className="font-serif text-lg font-semibold text-stone-800">Doctor notes</h2>
                <p className="text-[11px] text-stone-400">Keep questions, symptoms, results, images, and the exact days they relate to.</p>
              </div>
              <button onClick={() => { setOpen(false); setDraft(null); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200/70 text-xl text-stone-500">×</button>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoPick} />

            <div className="flex-1 overflow-y-auto p-4">
              {draft ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value })} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700" style={{ fontSize: 16 }}>
                      {NOTE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                    <button onClick={() => setDraft({ ...draft, pinned: !draft.pinned })} className="rounded-xl border px-3 py-2.5 text-sm font-semibold" style={{ borderColor: draft.pinned ? '#D9A94B' : '#e7e5e4', background: draft.pinned ? '#FBF5E8' : '#fff', color: draft.pinned ? '#A97920' : '#78716c' }}>
                      {draft.pinned ? '★ Bring up next visit' : '☆ Pin for next visit'}
                    </button>
                  </div>

                  <input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Short title — e.g. burning under left foot" className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm" style={{ fontSize: 16 }} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.target.value })} placeholder="Doctor / clinic" className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm" style={{ fontSize: 16 }} />
                    <input value={draft.referenceText} onChange={event => setDraft({ ...draft, referenceText: event.target.value })} placeholder="Reference — MRI, portal message…" className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm" style={{ fontSize: 16 }} />
                  </div>
                  <textarea value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} rows={7} placeholder="What happened, when it started, what makes it better or worse, and what you want the doctor to answer…" className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm" style={{ fontSize: 16 }} />

                  <div className="rounded-2xl border border-stone-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Related days</p>
                        <p className="mt-0.5 text-[11px] text-stone-400">Link symptom days, appointments, hikes, flare-ups, or treatment days.</p>
                      </div>
                      <button onClick={() => addDate(selectedDate)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold" style={{ background: '#E4ECE6', color: '#476653' }}>+ Current day</button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input type="date" value={dateToAdd} onChange={event => setDateToAdd(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-2 text-sm" />
                      <button onClick={() => addDate(dateToAdd)} className="rounded-lg bg-stone-100 px-3 text-xs font-semibold text-stone-600">Add</button>
                    </div>
                    {draft.linkedDates.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {draft.linkedDates.map(date => (
                          <span key={date} className="inline-flex items-center overflow-hidden rounded-full border border-stone-200 bg-stone-50 text-[11px] text-stone-600">
                            <button onClick={() => openDay(date)} className="px-2 py-1 font-semibold" title="Open this day">{displayDate(date)}</button>
                            <button onClick={() => setDraft({ ...draft, linkedDates: draft.linkedDates.filter(item => item !== date) })} className="border-l border-stone-200 px-1.5 py-1 text-stone-400">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Images</p>
                        <p className="mt-0.5 text-[11px] text-stone-400">Save swelling, skin changes, marked pain locations, scans, or written instructions.</p>
                      </div>
                      <button onClick={() => fileInputRef.current?.click()} disabled={preparingPhotos || draft.photoAttachments.length >= MAX_PHOTOS} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40" style={{ background: '#E4ECE6', color: '#476653' }}>
                        {preparingPhotos ? 'Preparing…' : '📷 Add'}
                      </button>
                    </div>
                    {draft.photoAttachments.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {draft.photoAttachments.map(photo => (
                          <div key={photo.id} className="relative overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                            <button onClick={() => setSelectedPhoto(photo)} className="block w-full"><img src={photo.dataUrl} alt={photo.name} className="h-24 w-full object-cover" /></button>
                            <button onClick={() => setDraft({ ...draft, photoAttachments: draft.photoAttachments.filter(item => item.id !== photo.id) })} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-sm text-white">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-stone-400">{draft.photoAttachments.length}/{MAX_PHOTOS} photos</p>
                  </div>

                  {error && <p className="rounded-xl bg-white px-3 py-2 text-xs text-rose-600">{error}</p>}

                  <div className="flex gap-2">
                    <button onClick={() => void saveDraft()} disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: '#7E9B86' }}>{saving ? 'Saving…' : 'Save note'}</button>
                    <button onClick={() => void copyNote(draft)} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-600">Copy</button>
                    <button onClick={() => setDraft(null)} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-500">Cancel</button>
                  </div>
                  <button onClick={() => void deleteDraft()} disabled={saving} className="w-full rounded-xl py-2 text-xs font-semibold" style={{ color: confirmDelete ? '#fff' : '#C96B7A', background: confirmDelete ? '#C96B7A' : '#FBEFF1' }}>
                    {confirmDelete ? 'Tap again to permanently delete' : notes.some(note => note.id === draft.id) ? 'Delete note' : 'Discard new note'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex gap-2">
                    <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search symptoms, doctors, dates, results…" className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm" style={{ fontSize: 16 }} />
                    <button onClick={startNew} className="rounded-xl px-4 text-sm font-bold text-white" style={{ background: '#7E9B86' }}>+ New</button>
                  </div>

                  {error && <p className="mb-3 rounded-xl bg-white px-3 py-2 text-xs text-rose-600">{error}</p>}
                  {loading ? (
                    <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#7E9B86] border-t-transparent" /></div>
                  ) : filteredNotes.length === 0 ? (
                    <button onClick={startNew} className="w-full rounded-2xl border-2 border-dashed border-stone-200 bg-white/50 px-5 py-10 text-center">
                      <p className="font-serif text-lg font-semibold text-stone-700">No doctor notes yet</p>
                      <p className="mt-1 text-xs leading-relaxed text-stone-400">Start with the symptom or question you do not want to forget at the next appointment.</p>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {filteredNotes.map(note => (
                        <button key={note.id} onClick={() => editNote(note)} className="w-full rounded-2xl border border-stone-100 bg-white p-3 text-left shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {note.pinned && <span className="text-sm text-[#D9A94B]">★</span>}
                                <p className="truncate text-sm font-bold text-stone-800">{note.title || noteTypeLabel(note.kind)}</p>
                              </div>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">{noteTypeLabel(note.kind)}{note.provider ? ` · ${note.provider}` : ''}</p>
                              {note.body && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-stone-600">{note.body}</p>}
                            </div>
                            {note.photoAttachments.length > 0 && <img src={note.photoAttachments[0].dataUrl} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {note.linkedDates.slice(0, 3).map(date => <span key={date} className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold text-stone-500">{displayDate(date)}</span>)}
                            {note.linkedDates.length > 3 && <span className="text-[10px] text-stone-400">+{note.linkedDates.length - 3}</span>}
                            {note.photoAttachments.length > 0 && <span className="ml-auto text-[10px] text-stone-400">📷 {note.photoAttachments.length}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-h-full max-w-4xl" onClick={event => event.stopPropagation()}>
            <img src={selectedPhoto.dataUrl} alt={selectedPhoto.name} className="max-h-[90dvh] max-w-full rounded-2xl object-contain" />
            <button onClick={() => setSelectedPhoto(null)} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-2xl text-white">×</button>
          </div>
        </div>
      )}
    </>
  );
}
