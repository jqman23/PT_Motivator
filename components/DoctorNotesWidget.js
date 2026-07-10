'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MAX_PHOTOS = 5;
const DOCTOR_LIST_CONFIG_KEY = 'doctorNoteDoctors';
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

function parseDoctorList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
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

function responseTemplate() {
  return { answer: '', conversation: '', nextSteps: '' };
}

function responseSection(response) {
  const timestamp = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return [
    `Response - ${timestamp}`,
    response.answer.trim() ? `Answer: ${response.answer.trim()}` : '',
    response.conversation.trim() ? `Conversation: ${response.conversation.trim()}` : '',
    response.nextSteps.trim() ? `Next steps: ${response.nextSteps.trim()}` : '',
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

export default function DoctorNotesWidget({ selectedDate, onSelectDate, open, onClose, startInNew = false }) {
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
  const [doctors, setDoctors] = useState([]);
  const [respondingTo, setRespondingTo] = useState(null);
  const [responseDraft, setResponseDraft] = useState(responseTemplate);
  const [autoNewFromShortcut, setAutoNewFromShortcut] = useState(false);
  const [swipedNoteId, setSwipedNoteId] = useState('');
  const fileInputRef = useRef(null);
  const noteTouchStart = useRef(null);

  useEffect(() => {
    setDateToAdd(selectedDate);
  }, [selectedDate]);

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
    if (startInNew) {
      setDraft(blankNote(selectedDate));
      setAutoNewFromShortcut(true);
      setDateToAdd(selectedDate);
      setConfirmDelete(false);
      setError('');
    }
    setLoading(true);
    setError('');
    Promise.all([
      fetch('/api/doctor-notes', { cache: 'no-store' })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(text(data.error) || 'Could not load doctor notes.');
          return (Array.isArray(data.rows) ? data.rows : []).map(parseNote);
        }),
      fetch(`/api/config?key=${encodeURIComponent(DOCTOR_LIST_CONFIG_KEY)}`, { cache: 'no-store' })
        .then(response => response.json())
        .then(data => parseDoctorList(data.value))
        .catch(() => []),
    ])
      .then(([nextNotes, nextDoctors]) => {
        if (cancelled) return;
        setNotes(nextNotes);
        setDoctors(nextDoctors);
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
  }, [open, selectedDate, startInNew]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter(note => [note.title, note.provider, note.referenceText, note.body, typeLabel(note.kind), ...note.linkedDates]
      .join(' ')
      .toLowerCase()
      .includes(query));
  }, [notes, search]);

  function closeWidget() {
    onClose();
    setDraft(null);
    setRespondingTo(null);
    setAutoNewFromShortcut(false);
    setConfirmDelete(false);
    setError('');
  }

  function startNew() {
    setDraft(blankNote(selectedDate));
    setRespondingTo(null);
    setAutoNewFromShortcut(false);
    setDateToAdd(selectedDate);
    setConfirmDelete(false);
    setError('');
  }

  function startResponse(note) {
    setDraft(null);
    setRespondingTo({ ...note, linkedDates: [...note.linkedDates], photoAttachments: [...note.photoAttachments] });
    setResponseDraft(responseTemplate());
    setConfirmDelete(false);
    setError('');
  }

  function noteSwipeHandlers(noteId) {
    return {
      onTouchStart(event) {
        const touch = event.touches[0];
        noteTouchStart.current = touch ? { id: noteId, x: touch.clientX, y: touch.clientY } : null;
      },
      onTouchEnd(event) {
        const start = noteTouchStart.current;
        noteTouchStart.current = null;
        const touch = event.changedTouches[0];
        if (!start || !touch || start.id !== noteId) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dy) > 45 || Math.abs(dx) < 45) return;
        setSwipedNoteId(dx < 0 ? noteId : '');
      },
    };
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
      if (autoNewFromShortcut) closeWidget();
      else setDraft(null);
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
      if (autoNewFromShortcut) closeWidget();
      else setDraft(null);
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

  async function deleteNote(noteId) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/doctor-notes?id=${encodeURIComponent(noteId)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.error) || 'Could not delete note.');
      setNotes(previous => previous.filter(note => note.id !== noteId));
      if (swipedNoteId === noteId) setSwipedNoteId('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete note.');
    } finally {
      setSaving(false);
    }
  }

  async function saveResponse() {
    if (!respondingTo) return;
    const section = responseSection(responseDraft);
    if (!responseDraft.answer.trim() && !responseDraft.conversation.trim() && !responseDraft.nextSteps.trim()) {
      setError('Add an answer or note before saving.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = {
        ...respondingTo,
        body: [respondingTo.body?.trim(), section].filter(Boolean).join('\n\n'),
      };
      const response = await fetch('/api/doctor-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.error) || 'Could not save response.');
      const saved = parseNote(data.row || updated);
      setNotes(previous => [saved, ...previous.filter(note => note.id !== saved.id)]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
      setRespondingTo(null);
      setResponseDraft(responseTemplate());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save response.');
    } finally {
      setSaving(false);
    }
  }

  async function addDoctor() {
    const name = window.prompt('Doctor name', draft?.provider || '');
    const clean = name?.trim();
    if (!clean) return;
    const nextDoctors = parseDoctorList([...doctors, clean]);
    setDoctors(nextDoctors);
    if (draft) setDraft({ ...draft, provider: clean });
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: DOCTOR_LIST_CONFIG_KEY, value: nextDoctors }),
      });
    } catch {
      setError('Doctor saved on this screen, but could not sync the list.');
    }
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
            <p className="mt-0.5 text-[11px] leading-snug text-stone-400">Quick notes, photos, and related days.</p>
          </div>
          <button type="button" onClick={closeWidget} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-stone-200/70 text-2xl text-stone-500" aria-label="Close doctor notes">×</button>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={attachPhotos} />

        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 sm:p-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {respondingTo ? (
            <div className="min-w-0 space-y-3">
              <div className="rounded-2xl border border-stone-200 bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Responding to</p>
                <h3 className="mt-1 text-sm font-bold text-stone-800">{respondingTo.title || typeLabel(respondingTo.kind)}</h3>
                {respondingTo.body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-stone-500">{respondingTo.body}</p>}
              </div>

              <textarea value={responseDraft.answer} onChange={event => setResponseDraft({ ...responseDraft, answer: event.currentTarget.value })} rows={3} placeholder="Answer" className="w-full min-w-0 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />
              <textarea value={responseDraft.conversation} onChange={event => setResponseDraft({ ...responseDraft, conversation: event.currentTarget.value })} rows={5} placeholder="Conversation notes" className="w-full min-w-0 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />
              <textarea value={responseDraft.nextSteps} onChange={event => setResponseDraft({ ...responseDraft, nextSteps: event.currentTarget.value })} rows={3} placeholder="Next steps" className="w-full min-w-0 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />

              {error && <p className="min-w-0 break-words rounded-xl bg-white px-3 py-2 text-xs text-rose-600">{error}</p>}

              <div className="grid min-w-0 grid-cols-2 gap-2">
                <button type="button" onClick={() => void saveResponse()} disabled={saving} className="min-h-12 min-w-0 rounded-xl px-3 py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: '#7E9B86' }}>{saving ? 'Saving...' : 'Save response'}</button>
                <button type="button" onClick={() => { setRespondingTo(null); setResponseDraft(responseTemplate()); }} className="min-h-12 min-w-0 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-500">Cancel</button>
              </div>
            </div>
          ) : draft ? (
            <div className="min-w-0 space-y-3">
              <div className="min-w-0">
                <select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.currentTarget.value })} className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-stone-700" style={{ fontSize: 16 }}>
                  {NOTE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>

              <input value={draft.title} onChange={event => setDraft({ ...draft, title: event.currentTarget.value })} placeholder="Title" className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />

              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                {doctors.length > 0 ? (
                  <select value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.currentTarget.value })} className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-stone-700" style={{ fontSize: 16 }}>
                    <option value="">Doctor</option>
                    {doctors.map(doctor => <option key={doctor} value={doctor}>{doctor}</option>)}
                  </select>
                ) : (
                  <input value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.currentTarget.value })} placeholder="Doctor" className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />
                )}
                <button type="button" onClick={() => void addDoctor()} className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-lg font-bold text-stone-500" aria-label="Add doctor" title="Add doctor">+</button>
              </div>

              <textarea value={draft.body} onChange={event => setDraft({ ...draft, body: event.currentTarget.value })} rows={7} placeholder="Notes" className="w-full min-w-0 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />

              <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Related days</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-stone-400">Add today or one or two dates this note points back to.</p>
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
                  <p className="mt-0.5 text-[11px] leading-snug text-stone-400">Add a symptom photo, screenshot, or instruction image.</p>
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
                <button type="button" onClick={() => { if (autoNewFromShortcut) closeWidget(); else setDraft(null); }} className="min-h-12 min-w-0 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-500">Cancel</button>
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
                  <p className="mt-1 text-xs leading-relaxed text-stone-400">Add a note or photo you want handy later.</p>
                </button>
              ) : (
                <div className="min-w-0 space-y-2">
                  {filteredNotes.map(note => (
                    <div key={note.id} className="relative min-w-0 overflow-hidden rounded-2xl">
                      <button type="button" onClick={() => void deleteNote(note.id)} disabled={saving} className="absolute inset-y-0 right-0 flex w-24 items-center justify-center rounded-2xl bg-[#C96B7A] text-xs font-bold text-white disabled:opacity-60">
                        Delete
                      </button>
                      <article
                        onClick={() => {
                          if (swipedNoteId === note.id) {
                            setSwipedNoteId('');
                            return;
                          }
                          setDraft({ ...note, linkedDates: [...note.linkedDates], photoAttachments: [...note.photoAttachments] });
                          setConfirmDelete(false);
                        }}
                        className="relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-stone-100 bg-white p-3 shadow-sm transition-transform active:scale-[0.995]"
                        style={{ transform: swipedNoteId === note.id ? 'translateX(-5.75rem)' : 'translateX(0)', touchAction: 'pan-y' }}
                        {...noteSwipeHandlers(note.id)}
                      >
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
                          <div className="ml-auto flex shrink-0 gap-1.5">
                            <button type="button" onClick={event => { event.stopPropagation(); startResponse(note); }} className="min-h-9 rounded-lg px-3 py-1 text-[10px] font-bold text-white" style={{ background: '#7E9B86' }}>Respond</button>
                            <button type="button" onClick={event => { event.stopPropagation(); void copyNote(note); }} className="min-h-9 rounded-lg bg-stone-100 px-3 py-1 text-[10px] font-semibold text-stone-500">Copy</button>
                          </div>
                        </div>
                      </article>
                    </div>
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

  return (
    <>
      {typeof document !== 'undefined' && modal ? createPortal(modal, document.body) : null}
      {typeof document !== 'undefined' && photoViewer ? createPortal(photoViewer, document.body) : null}
    </>
  );
}
