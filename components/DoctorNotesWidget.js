'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MAX_PHOTOS = 5;
const NOTE_TYPES = [
  ['question', 'Question for doctor'],
  ['symptom', 'Symptom / pattern'],
  ['visit', 'Visit note'],
  ['result', 'Diagnosis / test result'],
  ['plan', 'Plan / instruction'],
];

function makeId() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function typeLabel(kind) {
  return NOTE_TYPES.find(([value]) => value === kind)?.[1] || 'Doctor note';
}

function parseDates(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function parsePhotos(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object')
    .map((item, index) => ({
      id: text(item.id) || `photo-${Date.now()}-${index}`,
      name: text(item.name) || 'Doctor note photo',
      type: text(item.type) || 'image/jpeg',
      dataUrl: text(item.dataUrl),
      createdAt: text(item.createdAt) || new Date().toISOString(),
    }))
    .filter(photo => photo.dataUrl.startsWith('data:image/'))
    .slice(0, MAX_PHOTOS);
}

function parseNote(row) {
  return {
    id: text(row?.id),
    kind: text(row?.kind) || 'question',
    title: text(row?.title),
    provider: text(row?.provider),
    referenceText: text(row?.reference_text) || text(row?.referenceText),
    body: text(row?.body),
    linkedDates: parseDates(row?.linked_dates ?? row?.linkedDates),
    photoAttachments: parsePhotos(row?.photo_attachments ?? row?.photoAttachments),
    pinned: row?.pinned === true,
    createdAt: text(row?.created_at) || text(row?.createdAt) || new Date().toISOString(),
    updatedAt: text(row?.updated_at) || text(row?.updatedAt) || new Date().toISOString(),
  };
}

function blankNote(selectedDate) {
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

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image.'));
    image.src = dataUrl;
  });
}

async function preparePhoto(file) {
  const original = await fileAsDataUrl(file);
  let dataUrl = original;
  try {
    const image = await imageFromDataUrl(original);
    const scale = Math.min(1, 1100 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.76);
    }
  } catch {
    dataUrl = original;
  }
  return {
    id: makeId(),
    name: file.name || 'Doctor note photo',
    type: 'image/jpeg',
    dataUrl,
    createdAt: new Date().toISOString(),
  };
}

function noteAsText(note) {
  return [
    note.title || typeLabel(note.kind),
    note.provider ? `Provider: ${note.provider}` : '',
    note.referenceText ? `Reference: ${note.referenceText}` : '',
    note.linkedDates.length ? `Related dates: ${note.linkedDates.map(formatDate).join(', ')}` : '',
    note.body,
  ].filter(Boolean).join('\n');
}

function fallbackCopy(value) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

async function copyValue(value) {
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
  else fallbackCopy(value);
}

export default function DoctorNotesWidget({ selectedDate, onSelectDate }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [search, setSearch] = useState('');
  const [dateToAdd, setDateToAdd] = useState(selectedDate);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [buttonPosition, setButtonPosition] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDateToAdd(selectedDate);
  }, [selectedDate]);

  // Anchor the Doc button to the Settings button's real screen coordinates. This avoids
  // guessing from a zero-width flex item and keeps it exactly aligned during horizontal
  // toolbar scrolling, page scrolling, orientation changes, and viewport resizing.
  useEffect(() => {
    const settingsButton = document.querySelector('button[title="Widget settings"]');
    const toolbar = settingsButton?.parentElement;
    if (!settingsButton || !toolbar) return undefined;

    const previous = {
      alignItems: toolbar.style.alignItems,
      paddingBottom: toolbar.style.paddingBottom,
      overflowY: toolbar.style.overflowY,
    };

    toolbar.style.alignItems = 'flex-start';
    toolbar.style.paddingBottom = '42px';
    toolbar.style.overflowY = 'visible';

    let frame = 0;
    const updatePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = settingsButton.getBoundingClientRect();
        setButtonPosition({
          left: Math.round(rect.left),
          top: Math.round(rect.bottom + 6),
        });
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('orientationchange', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null;
    observer?.observe(settingsButton);
    observer?.observe(toolbar);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('orientationchange', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      toolbar.style.alignItems = previous.alignItems;
      toolbar.style.paddingBottom = previous.paddingBottom;
      toolbar.style.overflowY = previous.overflowY;
    };
  }, []);

  useEffect(() => {
    if (!open && !selectedPhoto) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [open, selectedPhoto]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch('/api/doctor-notes', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(text(data.error) || 'Could not load doctor notes.');
        if (!cancelled) setNotes((Array.isArray(data.rows) ? data.rows : []).map(parseNote));
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load doctor notes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter(note => [note.title, note.provider, note.referenceText, note.body, typeLabel(note.kind), ...note.linkedDates]
      .join(' ')
      .toLowerCase()
      .includes(query));
  }, [notes, search]);

  function closeWidget() {
    setOpen(false);
    setDraft(null);
    setConfirmDelete(false);
    setError('');
  }

  function startNew() {
    setDraft(blankNote(selectedDate));
    setDateToAdd(selectedDate);
    setConfirmDelete(false);
    setError('');
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/doctor-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.error) || 'Could not save doctor note.');
      const saved = parseNote(data.row || draft);
      setNotes(previous => [saved, ...previous.filter(note => note.id !== saved.id)]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
      setDraft(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save doctor note.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft() {
    if (!draft) return;
    const id = draft.id;
    if (!notes.some(note => note.id === id)) {
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
      const response = await fetch(`/api/doctor-notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.error) || 'Could not delete doctor note.');
      setNotes(previous => previous.filter(note => note.id !== id));
      setDraft(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete doctor note.');
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  function addDate(value) {
    if (!draft || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setDraft({ ...draft, linkedDates: Array.from(new Set([...draft.linkedDates, value])).sort() });
  }

  async function attachPhotos(event) {
    if (!draft) return;
    const files = Array.from(event.currentTarget.files || []).filter(file => file.type.startsWith('image/'));
    event.currentTarget.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - draft.photoAttachments.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_PHOTOS} photos per note.`);
      return;
    }
    setPreparingPhotos(true);
    setError('');
    try {
      const added = await Promise.all(files.slice(0, remaining).map(preparePhoto));
      setDraft(current => current ? { ...current, photoAttachments: [...current.photoAttachments, ...added].slice(0, MAX_PHOTOS) } : null);
      if (files.length > remaining) setError(`Added ${remaining}. Maximum ${MAX_PHOTOS} photos per note.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not attach photo.');
    } finally {
      setPreparingPhotos(false);
    }
  }

  async function copyNote(note) {
    try {
      await copyValue(noteAsText(note));
      setError('Copied to clipboard.');
      window.setTimeout(() => setError(''), 1400);
    } catch {
      setError('Could not copy note.');
    }
  }

  function openRelatedDay(date) {
    onSelectDate(date);
    closeWidget();
  }

  const modal = open ? (
    <div
      className="fixed inset-0 z-[120] flex h-[100dvh] w-screen max-w-full items-end justify-center overflow-hidden bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={closeWidget}
    >
      <div
        className="relative flex h-[100dvh] max-h-[100dvh] w-screen min-w-0 max-w-full flex-col overflow-hidden bg-[#F6F1E7] shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:w-full sm:max-w-lg sm:rounded-3xl"
        onClick={event => event.stopPropagation()}
      >
        <div
          className="flex min-w-0 flex-shrink-0 items-start justify-between gap-3 border-b border-stone-200 px-3 pb-3 sm:px-4 sm:pt-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-serif text-lg font-semibold text-stone-800">Doctor notes</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-stone-400">Questions, symptoms, results, images, and the exact days they relate to.</p>
          </div>
          <button type="button" onClick={closeWidget} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-stone-200/70 text-2xl text-stone-500" aria-label="Close doctor notes">×</button>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={attachPhotos} />

        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 sm:p-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {draft ? (
            <div className="min-w-0 space-y-3">
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                <select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.currentTarget.value })} className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-stone-700" style={{ fontSize: 16 }}>
                  {NOTE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" onClick={() => setDraft({ ...draft, pinned: !draft.pinned })} className="min-h-11 w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm font-semibold leading-snug" style={{ borderColor: draft.pinned ? '#D9A94B' : '#e7e5e4', background: draft.pinned ? '#FBF5E8' : '#fff', color: draft.pinned ? '#A97920' : '#78716c' }}>
                  {draft.pinned ? '★ Bring up next visit' : '☆ Pin for next visit'}
                </button>
              </div>

              <input value={draft.title} onChange={event => setDraft({ ...draft, title: event.currentTarget.value })} placeholder="Short title — e.g. burning under left foot" className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />

              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.currentTarget.value })} placeholder="Doctor / clinic" className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />
                <input value={draft.referenceText} onChange={event => setDraft({ ...draft, referenceText: event.currentTarget.value })} placeholder="Reference — MRI, portal message…" className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />
              </div>

              <textarea value={draft.body} onChange={event => setDraft({ ...draft, body: event.currentTarget.value })} rows={7} placeholder="What happened, when it started, what makes it better or worse, and what you want the doctor to answer…" className="w-full min-w-0 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />

              <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Related days</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-stone-400">Link symptom days, appointments, hikes, flare-ups, or treatments.</p>
                  </div>
                  <button type="button" onClick={() => addDate(selectedDate)} className="min-h-10 w-full rounded-lg px-3 py-2 text-[11px] font-bold sm:w-auto" style={{ background: '#E4ECE6', color: '#476653' }}>+ Current day</button>
                </div>
                <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <input type="date" value={dateToAdd} onChange={event => setDateToAdd(event.currentTarget.value)} className="min-h-11 w-full min-w-0 rounded-lg border border-stone-200 px-2.5 py-2" style={{ fontSize: 16 }} />
                  <button type="button" onClick={() => addDate(dateToAdd)} className="min-h-11 rounded-lg bg-stone-100 px-4 text-xs font-semibold text-stone-600">Add</button>
                </div>
                {draft.linkedDates.length > 0 && (
                  <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                    {draft.linkedDates.map(date => (
                      <span key={date} className="inline-flex max-w-full min-w-0 items-center overflow-hidden rounded-full border border-stone-200 bg-stone-50 text-[11px] text-stone-600">
                        <button type="button" onClick={() => openRelatedDay(date)} className="min-w-0 truncate px-2.5 py-2 font-semibold">{formatDate(date)}</button>
                        <button type="button" onClick={() => setDraft({ ...draft, linkedDates: draft.linkedDates.filter(item => item !== date) })} className="min-h-9 flex-shrink-0 border-l border-stone-200 px-2 text-stone-400" aria-label={`Remove ${formatDate(date)}`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Images</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-stone-400">Save swelling, pain locations, scans, or written instructions.</p>
                  </div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={preparingPhotos || draft.photoAttachments.length >= MAX_PHOTOS} className="min-h-10 w-full rounded-lg px-3 py-2 text-[11px] font-bold disabled:opacity-40 sm:w-auto" style={{ background: '#E4ECE6', color: '#476653' }}>
                    {preparingPhotos ? 'Preparing…' : '📷 Add photo'}
                  </button>
                </div>
                {draft.photoAttachments.length > 0 && (
                  <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
                    {draft.photoAttachments.map(photo => (
                      <div key={photo.id} className="relative min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                        <button type="button" onClick={() => setSelectedPhoto(photo)} className="block w-full"><img src={photo.dataUrl} alt={photo.name} className="h-28 w-full object-cover sm:h-24" /></button>
                        <button type="button" onClick={() => setDraft({ ...draft, photoAttachments: draft.photoAttachments.filter(item => item.id !== photo.id) })} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-lg text-white" aria-label="Remove photo">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[10px] text-stone-400">{draft.photoAttachments.length}/{MAX_PHOTOS} photos</p>
              </section>

              {error && <p className="min-w-0 break-words rounded-xl bg-white px-3 py-2 text-xs text-rose-600">{error}</p>}

              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <button type="button" onClick={() => void saveDraft()} disabled={saving} className="col-span-2 min-h-12 min-w-0 rounded-xl px-3 py-3 text-sm font-bold text-white disabled:opacity-50 sm:col-span-1" style={{ background: '#7E9B86' }}>{saving ? 'Saving…' : 'Save note'}</button>
                <button type="button" onClick={() => void copyNote(draft)} className="min-h-12 min-w-0 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-600">Copy</button>
                <button type="button" onClick={() => setDraft(null)} className="min-h-12 min-w-0 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-500">Cancel</button>
              </div>
              <button type="button" onClick={() => void deleteDraft()} disabled={saving} className="min-h-11 w-full min-w-0 rounded-xl px-3 py-2 text-xs font-semibold" style={{ color: confirmDelete ? '#fff' : '#C96B7A', background: confirmDelete ? '#C96B7A' : '#FBEFF1' }}>
                {confirmDelete ? 'Tap again to permanently delete' : notes.some(note => note.id === draft.id) ? 'Delete note' : 'Discard new note'}
              </button>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="mb-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input value={search} onChange={event => setSearch(event.currentTarget.value)} placeholder="Search symptoms, doctors, dates…" className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />
                <button type="button" onClick={startNew} className="min-h-11 rounded-xl px-4 text-sm font-bold text-white" style={{ background: '#7E9B86' }}>+ New</button>
              </div>
              {error && <p className="mb-3 min-w-0 break-words rounded-xl bg-white px-3 py-2 text-xs text-rose-600">{error}</p>}
              {loading ? (
                <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#7E9B86] border-t-transparent" /></div>
              ) : filteredNotes.length === 0 ? (
                <button type="button" onClick={startNew} className="min-h-44 w-full rounded-2xl border-2 border-dashed border-stone-200 bg-white/50 px-5 py-8 text-center">
                  <p className="font-serif text-lg font-semibold text-stone-700">No doctor notes yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-400">Start with the symptom or question you do not want to forget.</p>
                </button>
              ) : (
                <div className="min-w-0 space-y-2">
                  {filteredNotes.map(note => (
                    <article key={note.id} onClick={() => { setDraft({ ...note, linkedDates: [...note.linkedDates], photoAttachments: [...note.photoAttachments] }); setConfirmDelete(false); }} className="min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-stone-100 bg-white p-3 shadow-sm active:scale-[0.995]">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {note.pinned && <span className="flex-shrink-0 text-sm text-[#D9A94B]">★</span>}
                            <p className="min-w-0 truncate text-sm font-bold text-stone-800">{note.title || typeLabel(note.kind)}</p>
                          </div>
                          <p className="mt-0.5 min-w-0 truncate text-[10px] font-bold uppercase tracking-wider text-stone-400">{typeLabel(note.kind)}{note.provider ? ` · ${note.provider}` : ''}</p>
                          {note.body && <p className="mt-2 line-clamp-2 break-words text-xs leading-relaxed text-stone-600">{note.body}</p>}
                        </div>
                        {note.photoAttachments.length > 0 && <img src={note.photoAttachments[0].dataUrl} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />}
                      </div>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                        {note.linkedDates.slice(0, 2).map(date => <span key={date} className="max-w-full truncate rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold text-stone-500">{formatDate(date)}</span>)}
                        {note.linkedDates.length > 2 && <span className="text-[10px] text-stone-400">+{note.linkedDates.length - 2}</span>}
                        <button type="button" onClick={event => { event.stopPropagation(); void copyNote(note); }} className="ml-auto min-h-9 rounded-lg bg-stone-100 px-3 py-1 text-[10px] font-semibold text-stone-500">Copy</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const photoViewer = selectedPhoto ? (
    <div className="fixed inset-0 z-[140] flex h-[100dvh] w-screen max-w-full items-center justify-center overflow-hidden bg-black/90 p-3 sm:p-4" onClick={() => setSelectedPhoto(null)}>
      <div className="relative flex h-full w-full min-w-0 items-center justify-center" onClick={event => event.stopPropagation()}>
        <img src={selectedPhoto.dataUrl} alt={selectedPhoto.name} className="max-h-full max-w-full rounded-xl object-contain sm:rounded-2xl" />
        <button type="button" onClick={() => setSelectedPhoto(null)} className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-2xl text-white sm:right-2 sm:top-2" style={{ marginTop: 'env(safe-area-inset-top)' }} aria-label="Close photo">×</button>
      </div>
    </div>
  ) : null;

  const launcher = buttonPosition ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed z-40 h-9 w-9 rounded-xl border flex flex-col items-center justify-center gap-0.5 shadow-sm transition-all hover:shadow-md active:scale-95"
      style={{
        left: `${buttonPosition.left}px`,
        top: `${buttonPosition.top}px`,
        touchAction: 'manipulation',
        background: 'white',
        borderColor: '#e7e5e4',
        color: '#78716c',
      }}
      title="Doctor notes"
      aria-label="Doctor notes"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M5 2.5h7l3 3V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
        <path d="M12 2.5V6h3M7 10h6M7 13h4" />
      </svg>
      <span style={{ fontSize: '6.5px', lineHeight: 1, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.85 }}>doc</span>
    </button>
  ) : null;

  return (
    <>
      {typeof document !== 'undefined' && launcher ? createPortal(launcher, document.body) : null}
      {typeof document !== 'undefined' && modal ? createPortal(modal, document.body) : null}
      {typeof document !== 'undefined' && photoViewer ? createPortal(photoViewer, document.body) : null}
    </>
  );
}
