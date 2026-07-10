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

function parseTranscripts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object')
    .map((item, index) => ({
      id: text(item.id) || `transcript-${Date.now()}-${index}`,
      text: text(item.text).trim(),
      createdAt: text(item.createdAt) || new Date().toISOString(),
      updatedAt: text(item.updatedAt) || new Date().toISOString(),
    }))
    .filter(tile => tile.text)
    .slice(0, 20);
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
    responseTranscripts: parseTranscripts(row?.response_transcripts ?? row?.responseTranscripts),
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
  return { answer: '', nextSteps: '' };
}

function responseSection(response, transcriptCount = 0) {
  const timestamp = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return [
    `Response - ${timestamp}`,
    response.answer.trim() ? `Answer / notes: ${response.answer.trim()}` : '',
    transcriptCount > 0 ? `Transcript tiles: ${transcriptCount}` : '',
    response.nextSteps.trim() ? `Next steps: ${response.nextSteps.trim()}` : '',
  ].filter(Boolean).join('\n');
}

function parseLegacyResponseTranscripts(body) {
  if (typeof body !== 'string' || !body.trim()) return [];
  const transcriptMatches = Array.from(body.matchAll(/Transcript:\s*([\s\S]*?)(?:\n(?:Next steps:|Response - |Answer \/ notes:)|$)/g));
  return transcriptMatches
    .map((match, index) => ({
      id: `legacy-transcript-${index}-${Date.now()}`,
      text: (match[1] || '').trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
    .filter(tile => tile.text);
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
  const [cleanupNote, setCleanupNote] = useState(null);
  const [cleanupDraft, setCleanupDraft] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupError, setCleanupError] = useState('');
  const [responseListening, setResponseListening] = useState(false);
  const [responsePaused, setResponsePaused] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [responseTranscriptTiles, setResponseTranscriptTiles] = useState([]);
  const [editingTranscriptId, setEditingTranscriptId] = useState('');
  const [editingTranscriptValue, setEditingTranscriptValue] = useState('');
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const recordingFinalRef = useRef('');
  const recordingLiveRef = useRef('');
  const recordingStopIntentRef = useRef('');
  const recordingTranscriptIdRef = useRef('');
  const noteTouchStart = useRef(null);
  const lastTapRef = useRef({ id: '', time: 0 });

  const draftOriginal = draft ? notes.find(note => note.id === draft.id) : null;
  const draftBaseline = draftOriginal || (draft ? blankNote(selectedDate) : null);
  if (draftBaseline && draft) draftBaseline.id = draft.id;
  const draftDirty = !!draft && !!draftBaseline && JSON.stringify({
    kind: draft.kind,
    title: draft.title,
    provider: draft.provider,
    body: draft.body,
    linkedDates: draft.linkedDates,
    photoAttachments: draft.photoAttachments,
  }) !== JSON.stringify({
    kind: draftBaseline.kind,
    title: draftBaseline.title,
    provider: draftBaseline.provider,
    body: draftBaseline.body,
    linkedDates: draftBaseline.linkedDates,
    photoAttachments: draftBaseline.photoAttachments,
  });

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
    recognitionRef.current?.stop?.();
    recordingTranscriptIdRef.current = '';
    onClose();
    setDraft(null);
    setRespondingTo(null);
    setCleanupNote(null);
    setCleanupDraft(null);
    setAutoNewFromShortcut(false);
    setConfirmDelete(false);
    setConfirmingDiscard(false);
    setResponseListening(false);
    setResponsePaused(false);
    setLiveTranscript('');
    setResponseTranscriptTiles([]);
    setEditingTranscriptId('');
    setEditingTranscriptValue('');
    recordingFinalRef.current = '';
    recordingLiveRef.current = '';
    setError('');
  }

  function closeHeader() {
    if (draft) {
      if (draftDirty) {
        setConfirmingDiscard(true);
        return;
      }
      setDraft(null);
      setAutoNewFromShortcut(false);
      setConfirmDelete(false);
      setError('');
      return;
    }
    closeWidget();
  }

  function backToNotesHome() {
    recognitionRef.current?.stop?.();
    recordingTranscriptIdRef.current = '';
    setDraft(null);
    setRespondingTo(null);
    setCleanupNote(null);
    setCleanupDraft(null);
    setAutoNewFromShortcut(false);
    setConfirmDelete(false);
    setConfirmingDiscard(false);
    setError('');
    setResponseListening(false);
    setResponsePaused(false);
    setLiveTranscript('');
    setResponseTranscriptTiles([]);
    setEditingTranscriptId('');
    setEditingTranscriptValue('');
    recordingFinalRef.current = '';
    recordingLiveRef.current = '';
  }

  function rememberUndo(label) {
    setUndoSnapshot({
      label,
      notes: notes.map(note => ({
        ...note,
        linkedDates: [...note.linkedDates],
        photoAttachments: [...note.photoAttachments],
        responseTranscripts: [...(note.responseTranscripts || [])],
      })),
    });
  }

  async function undoLastChange() {
    if (!undoSnapshot) return;
    const current = notes;
    const previous = undoSnapshot.notes;
    setNotes(previous);
    setUndoSnapshot(null);
    setError('');
    try {
      const previousIds = new Set(previous.map(note => note.id));
      await Promise.all([
        ...current.filter(note => !previousIds.has(note.id)).map(note => fetch(`/api/doctor-notes?id=${encodeURIComponent(note.id)}`, { method: 'DELETE' })),
        ...previous.map(note => fetch('/api/doctor-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(note),
        })),
      ]);
    } catch {
      setError('Undo restored locally, but could not fully sync.');
    }
  }

  function startNew() {
    setDraft(blankNote(selectedDate));
    setRespondingTo(null);
    setAutoNewFromShortcut(false);
    setDateToAdd(selectedDate);
    setConfirmDelete(false);
    setConfirmingDiscard(false);
    setError('');
  }

  function startResponse(note) {
    setDraft(null);
    setRespondingTo({
      ...note,
      linkedDates: [...note.linkedDates],
      photoAttachments: [...note.photoAttachments],
      responseTranscripts: [...(note.responseTranscripts || [])],
    });
    setResponseDraft(responseTemplate());
    setResponseTranscriptTiles(note.responseTranscripts?.length > 0 ? note.responseTranscripts : parseLegacyResponseTranscripts(note.body));
    setEditingTranscriptId('');
    setEditingTranscriptValue('');
    setLiveTranscript('');
    recordingTranscriptIdRef.current = '';
    recordingFinalRef.current = '';
    setConfirmDelete(false);
    setError('');
  }

  async function startCleanup(note) {
    setDraft(null);
    setRespondingTo(null);
    setCleanupNote(note);
    setCleanupDraft({
      improvedTitle: note.title || typeLabel(note.kind),
      improvedBody: note.body || '',
      highlights: [],
      questions: [],
    });
    setCleanupLoading(true);
    setCleanupError('');
    setError('');
    try {
      const response = await fetch('/api/doctor-note-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: note.title,
          doctor: note.provider,
          kind: typeLabel(note.kind),
          body: note.body,
          relatedDates: note.linkedDates,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.detail) || text(data.error) || 'Could not clean up note.');
      setCleanupDraft({
        improvedTitle: text(data.improvedTitle) || note.title || typeLabel(note.kind),
        improvedBody: text(data.improvedBody) || note.body || '',
        highlights: Array.isArray(data.highlights) ? data.highlights.filter(item => typeof item === 'string') : [],
        questions: Array.isArray(data.questions) ? data.questions.filter(item => typeof item === 'string') : [],
      });
    } catch (reason) {
      setCleanupError(reason instanceof Error ? reason.message : 'Could not clean up note.');
    } finally {
      setCleanupLoading(false);
    }
  }

  function noteSwipeHandlers(note) {
    return {
      onTouchStart(event) {
        const touch = event.touches[0];
        noteTouchStart.current = touch ? { id: note.id, x: touch.clientX, y: touch.clientY } : null;
      },
      onTouchEnd(event) {
        const start = noteTouchStart.current;
        noteTouchStart.current = null;
        const touch = event.changedTouches[0];
        if (!start || !touch || start.id !== note.id) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dy) > 45) return;
        if (Math.abs(dx) >= 45) {
          setSwipedNoteId(dx < 0 ? note.id : '');
          if (dx >= 0) setConfirmDeleteId('');
          return;
        }
        const now = Date.now();
        if (lastTapRef.current.id === note.id && now - lastTapRef.current.time < 340) {
          lastTapRef.current = { id: '', time: 0 };
          void startCleanup(note);
          return;
        }
        lastTapRef.current = { id: note.id, time: now };
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
      rememberUndo(notes.some(note => note.id === saved.id) ? 'edit' : 'new note');
      setNotes(previous => [saved, ...previous.filter(note => note.id !== saved.id)]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
      setDraft(null);
      setAutoNewFromShortcut(false);
      setConfirmingDiscard(false);
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
      setAutoNewFromShortcut(false);
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
      rememberUndo('delete');
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
    if (confirmDeleteId !== noteId) {
      setConfirmDeleteId(noteId);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/doctor-notes?id=${encodeURIComponent(noteId)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.error) || 'Could not delete note.');
      rememberUndo('delete');
      setNotes(previous => previous.filter(note => note.id !== noteId));
      if (swipedNoteId === noteId) setSwipedNoteId('');
      setConfirmDeleteId('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete note.');
    } finally {
      setSaving(false);
    }
  }

  async function saveResponse() {
    if (!respondingTo) return;
    const section = responseSection(responseDraft, responseTranscriptTiles.length);
    const answerNotes = responseDraft.answer.trim();
    if (!answerNotes && !responseDraft.nextSteps.trim() && responseTranscriptTiles.length === 0) {
      setError('Add an answer, transcript, or next step before saving.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = {
        ...respondingTo,
        body: [respondingTo.body?.trim(), section].filter(Boolean).join('\n\n'),
        responseTranscripts: responseTranscriptTiles.map(tile => ({
          id: tile.id,
          text: tile.text,
          createdAt: tile.createdAt,
          updatedAt: tile.updatedAt,
        })),
      };
      const response = await fetch('/api/doctor-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.error) || 'Could not save response.');
      const saved = parseNote(data.row || updated);
      rememberUndo('response');
      setNotes(previous => [saved, ...previous.filter(note => note.id !== saved.id)]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
      setRespondingTo(null);
      setResponseDraft(responseTemplate());
      setResponseTranscriptTiles([]);
      setEditingTranscriptId('');
      setEditingTranscriptValue('');
      recordingTranscriptIdRef.current = '';
      recordingFinalRef.current = '';
      recordingLiveRef.current = '';
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save response.');
    } finally {
      setSaving(false);
    }
  }

  async function cleanupResponse() {
    if (!respondingTo) return;
    const raw = [
      responseDraft.answer.trim() ? `Answer / notes: ${responseDraft.answer.trim()}` : '',
      ...responseTranscriptTiles.map(tile => (tile.text.trim() ? `Transcript: ${tile.text.trim()}` : '')),
      responseDraft.nextSteps.trim() ? `Next steps: ${responseDraft.nextSteps.trim()}` : '',
    ].filter(Boolean).join('\n');
    if (!raw) {
      setError('Add an answer or note before cleanup.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/doctor-note-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Response to ${respondingTo.title || typeLabel(respondingTo.kind)}`,
          doctor: respondingTo.provider,
          kind: 'Doctor response',
          body: raw,
          relatedDates: respondingTo.linkedDates,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.detail) || text(data.error) || 'Could not clean up response.');
      setResponseDraft({ answer: text(data.improvedBody) || raw, conversation: '', nextSteps: '' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not clean up response.');
    } finally {
      setSaving(false);
    }
  }

  function startResponseRecording(resuming = false) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recording is not available in this browser.');
      return;
    }

    const now = new Date().toISOString();
    const existingId = recordingTranscriptIdRef.current;
    if (!resuming || !existingId) {
      const nextId = makeId();
      recordingTranscriptIdRef.current = nextId;
      recordingFinalRef.current = '';
      recordingLiveRef.current = '';
      setEditingTranscriptId('');
      setEditingTranscriptValue('');
      setResponseTranscriptTiles(previous => [{ id: nextId, text: '', createdAt: now, updatedAt: now }, ...previous]);
    } else {
      setResponseTranscriptTiles(previous => previous.map(tile => (tile.id === existingId ? { ...tile, updatedAt: now } : tile)));
    }

    recordingStopIntentRef.current = '';
    setLiveTranscript(recordingLiveRef.current.trim());

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;
    const activeTranscriptId = recordingTranscriptIdRef.current;

    recognition.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i]?.[0]?.transcript || '';
        if (event.results[i]?.isFinal) recordingFinalRef.current = `${recordingFinalRef.current} ${transcript}`.trim();
        else interim += transcript;
      }
      const live = [recordingFinalRef.current, interim].filter(Boolean).join(' ').trim();
      recordingLiveRef.current = live;
      const updatedAt = new Date().toISOString();
      setLiveTranscript(live);
      setResponseTranscriptTiles(previous => previous.map(tile => (
        tile.id === activeTranscriptId ? { ...tile, text: live, updatedAt } : tile
      )));
    };
    recognition.onerror = event => {
      const intentional = recordingStopIntentRef.current === 'stop' || recordingStopIntentRef.current === 'pause';
      setResponseListening(false);
      if (intentional || event?.error === 'no-speech' || event?.error === 'aborted') return;
      setResponsePaused(false);
      if (event?.error === 'not-allowed') setError('Microphone permission was blocked.');
    };
    recognition.onend = () => {
      const intent = recordingStopIntentRef.current;
      const currentText = recordingLiveRef.current.trim();
      setResponseListening(false);
      recognitionRef.current = null;
      if (!intent || intent === 'stop') {
        if (!currentText) {
          setResponseTranscriptTiles(previous => previous.filter(tile => tile.id !== activeTranscriptId));
        } else {
          setResponseTranscriptTiles(previous => previous.map(tile => (
            tile.id === activeTranscriptId ? { ...tile, text: currentText, updatedAt: new Date().toISOString() } : tile
          )));
        }
        recordingTranscriptIdRef.current = '';
        recordingFinalRef.current = '';
        recordingLiveRef.current = '';
        setResponsePaused(false);
      } else if (intent === 'pause') {
        if (currentText) {
          setResponseTranscriptTiles(previous => previous.map(tile => (
            tile.id === activeTranscriptId ? { ...tile, text: currentText, updatedAt: new Date().toISOString() } : tile
          )));
        }
        setResponsePaused(true);
      }
      recordingStopIntentRef.current = '';
      setLiveTranscript('');
    };
    setError('');
    setResponseListening(true);
    setResponsePaused(false);
    try {
      recognition.start();
    } catch {
      setResponseListening(false);
      setResponsePaused(false);
      setError('Recording could not start.');
    }
  }

  function stopResponseRecording() {
    recordingStopIntentRef.current = 'stop';
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setResponseListening(false);
    setResponsePaused(false);
    setError('');
  }

  function pauseResponseRecording() {
    recordingStopIntentRef.current = 'pause';
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setResponseListening(false);
    setResponsePaused(true);
    setError('');
  }

  function startEditingTranscript(tile) {
    setEditingTranscriptId(tile.id);
    setEditingTranscriptValue(tile.text);
    setError('');
  }

  function saveTranscriptEdit(tileId) {
    const nextText = editingTranscriptValue.trim();
    if (!nextText) {
      setError('Transcript cannot be empty.');
      return;
    }
    const updatedAt = new Date().toISOString();
    setResponseTranscriptTiles(previous => previous.map(tile => (
      tile.id === tileId ? { ...tile, text: nextText, updatedAt } : tile
    )));
    setEditingTranscriptId('');
    setEditingTranscriptValue('');
    setError('');
  }

  function cancelTranscriptEdit() {
    setEditingTranscriptId('');
    setEditingTranscriptValue('');
  }

  function deleteTranscript(tileId) {
    setResponseTranscriptTiles(previous => previous.filter(tile => tile.id !== tileId));
    if (recordingTranscriptIdRef.current === tileId) {
      recordingTranscriptIdRef.current = '';
      recordingFinalRef.current = '';
      recognitionRef.current?.stop?.();
    }
    if (editingTranscriptId === tileId) cancelTranscriptEdit();
    setError('');
  }

  async function incorporateCleanup() {
    if (!cleanupNote || !cleanupDraft) return;
    setSaving(true);
    setCleanupError('');
    try {
      const updated = {
        ...cleanupNote,
        title: cleanupDraft.improvedTitle.trim(),
        body: cleanupDraft.improvedBody.trim(),
      };
      const response = await fetch('/api/doctor-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.error) || 'Could not update note.');
      const saved = parseNote(data.row || updated);
      rememberUndo('cleanup');
      setNotes(previous => [saved, ...previous.filter(note => note.id !== saved.id)]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
      setCleanupNote(null);
      setCleanupDraft(null);
    } catch (reason) {
      setCleanupError(reason instanceof Error ? reason.message : 'Could not update note.');
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
      onClick={closeHeader}
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
          {undoSnapshot && (
            <button type="button" onClick={() => void undoLastChange()} className="min-h-10 flex-shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-600" aria-label={`Undo ${undoSnapshot.label}`}>
              Undo
            </button>
          )}
          <button type="button" onClick={closeHeader} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-stone-200/70 text-2xl text-stone-500" aria-label="Close doctor notes">×</button>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={attachPhotos} />

        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 sm:p-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {cleanupNote && cleanupDraft ? (
            <div className="min-w-0 space-y-3">
              <div className="rounded-2xl border border-stone-200 bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Clean up note</p>
                <h3 className="mt-1 text-sm font-bold text-stone-800">{cleanupNote.title || typeLabel(cleanupNote.kind)}</h3>
                <p className="mt-1 text-xs leading-relaxed text-stone-500">Review the clearer doctor-facing version, edit anything, then incorporate it into the original note.</p>
              </div>

              {cleanupLoading && (
                <div className="flex min-h-24 items-center justify-center rounded-2xl bg-white">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#7E9B86] border-t-transparent" />
                </div>
              )}

              <input value={cleanupDraft.improvedTitle} onChange={event => setCleanupDraft({ ...cleanupDraft, improvedTitle: event.currentTarget.value })} placeholder="Title" className="min-h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />
              <textarea value={cleanupDraft.improvedBody} onChange={event => setCleanupDraft({ ...cleanupDraft, improvedBody: event.currentTarget.value })} rows={10} placeholder="Improved note" className="w-full min-w-0 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />

              {(cleanupDraft.highlights.length > 0 || cleanupDraft.questions.length > 0) && (
                <div className="rounded-2xl border border-stone-200 bg-white p-3">
                  {cleanupDraft.highlights.length > 0 && (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Changed</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {cleanupDraft.highlights.map((item, index) => <span key={`${item}-${index}`} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">{item}</span>)}
                      </div>
                    </>
                  )}
                  {cleanupDraft.questions.length > 0 && (
                    <div className={cleanupDraft.highlights.length > 0 ? 'mt-3' : ''}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Helpful missing details</p>
                      <div className="mt-2 space-y-1.5">
                        {cleanupDraft.questions.map((item, index) => <p key={`${item}-${index}`} className="rounded-xl bg-[#FDF8EE] px-3 py-2 text-xs leading-snug text-stone-600">{item}</p>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {cleanupError && <p className="min-w-0 break-words rounded-xl bg-white px-3 py-2 text-xs text-rose-600">{cleanupError}</p>}

              <div className="grid min-w-0 grid-cols-2 gap-2">
                <button type="button" onClick={() => void incorporateCleanup()} disabled={saving || cleanupLoading} className="min-h-12 min-w-0 rounded-xl px-3 py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: '#7E9B86' }}>{saving ? 'Saving...' : 'Incorporate'}</button>
                <button type="button" onClick={() => { setCleanupNote(null); setCleanupDraft(null); setCleanupError(''); }} className="min-h-12 min-w-0 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-500">Cancel</button>
              </div>
            </div>
          ) : respondingTo ? (
            <div className="min-w-0 space-y-3">
              <div className="rounded-2xl border border-stone-200 bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Responding to</p>
                <h3 className="mt-1 text-sm font-bold text-stone-800">{respondingTo.title || typeLabel(respondingTo.kind)}</h3>
                {respondingTo.body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-stone-500">{respondingTo.body}</p>}
              </div>

              <textarea value={responseDraft.answer} onChange={event => setResponseDraft({ ...responseDraft, answer: event.currentTarget.value })} rows={5} placeholder="Answer / notes" className="w-full min-w-0 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />

              {(responseTranscriptTiles.length > 0 || responseListening) && (
                <div className="rounded-xl border border-[#E8D9B4] bg-[#FDF8EE] p-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#A97920]">{responseListening ? 'Live transcript' : 'Transcripts'}</p>
                    {responseListening && <span className="h-2 w-2 animate-pulse rounded-full bg-[#C96B7A]" />}
                  </div>
                  <div className="space-y-1.5">
                    {responseTranscriptTiles.map(tile => {
                      const liveTile = responseListening && recordingTranscriptIdRef.current === tile.id;
                      const isEditing = editingTranscriptId === tile.id;
                      return (
                        <div key={tile.id} className="rounded-lg border border-[#E8D9B4] bg-white p-2 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A97920]">
                              {liveTile ? 'Recording' : new Date(tile.updatedAt || tile.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                            {!liveTile && !isEditing && (
                              <div className="flex shrink-0 gap-1">
                                <button type="button" onClick={() => startEditingTranscript(tile)} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">Edit</button>
                                <button type="button" onClick={() => void deleteTranscript(tile.id)} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">Delete</button>
                              </div>
                            )}
                            {liveTile && <span className="text-[10px] font-bold text-[#C96B7A]">Live</span>}
                          </div>
                          {isEditing ? (
                            <div className="mt-1.5 space-y-1.5">
                              <textarea
                                value={editingTranscriptValue}
                                onChange={event => setEditingTranscriptValue(event.currentTarget.value)}
                                rows={3}
                                className="w-full min-w-0 resize-none rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-xs leading-relaxed"
                                style={{ fontSize: 16 }}
                              />
                              <div className="grid grid-cols-2 gap-1.5">
                                <button type="button" onClick={() => saveTranscriptEdit(tile.id)} className="min-h-9 rounded-lg bg-[#7E9B86] px-2 py-1.5 text-xs font-bold text-white">Save</button>
                                <button type="button" onClick={cancelTranscriptEdit} className="min-h-9 rounded-lg bg-stone-100 px-2 py-1.5 text-xs font-semibold text-stone-600">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[11px] leading-snug text-stone-700">{tile.text || (liveTile ? 'Listening...' : 'Transcript')}</p>
                          )}
                        </div>
                      );
                    })}
                    {responseTranscriptTiles.length === 0 && responseListening && (
                      <p className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] leading-snug text-stone-600">Listening...</p>
                    )}
                  </div>
                </div>
              )}
              <textarea value={responseDraft.nextSteps} onChange={event => setResponseDraft({ ...responseDraft, nextSteps: event.currentTarget.value })} rows={2} placeholder="Next steps" className="w-full min-w-0 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5" style={{ fontSize: 16 }} />

              {error && <p className="min-w-0 break-words rounded-xl bg-white px-3 py-2 text-xs text-rose-600">{error}</p>}

              <div className="grid min-w-0 grid-cols-2 gap-2">
                <button type="button" onClick={() => void saveResponse()} disabled={saving} className="min-h-12 min-w-0 rounded-xl px-3 py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: '#7E9B86' }}>{saving ? 'Saving...' : 'Save response'}</button>
                <button type="button" onClick={() => { recordingStopIntentRef.current = 'stop'; recognitionRef.current?.stop?.(); setRespondingTo(null); setResponseDraft(responseTemplate()); setResponseListening(false); setResponsePaused(false); setLiveTranscript(''); setResponseTranscriptTiles([]); setEditingTranscriptId(''); setEditingTranscriptValue(''); recordingTranscriptIdRef.current = ''; recordingFinalRef.current = ''; recordingLiveRef.current = ''; }} className="min-h-12 min-w-0 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-500">Cancel</button>
                <button type="button" onClick={() => void cleanupResponse()} disabled={saving} className="min-h-12 min-w-0 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-600 disabled:opacity-50">Clean up</button>
                {responseListening ? (
                  <>
                    <button type="button" onClick={pauseResponseRecording} className="min-h-12 min-w-0 rounded-xl px-3 py-3 text-sm font-bold" style={{ background: '#FDF8EE', color: '#A97920' }}>Pause</button>
                    <button type="button" onClick={stopResponseRecording} className="min-h-12 min-w-0 rounded-xl px-3 py-3 text-sm font-bold" style={{ background: '#FBEFF1', color: '#C96B7A' }}>Stop</button>
                  </>
                ) : (
                  <button type="button" onClick={() => startResponseRecording(responsePaused)} className="min-h-12 min-w-0 rounded-xl px-3 py-3 text-sm font-bold" style={{ background: responsePaused ? '#E4ECE6' : '#FDF8EE', color: responsePaused ? '#476653' : '#A97920' }}>{responsePaused ? 'Resume' : 'Record voice'}</button>
                )}
              </div>
            </div>
          ) : draft ? (
            <div className="min-w-0 space-y-3">
              {confirmingDiscard && (
                <div className="rounded-2xl border border-[#E8D9B4] bg-[#FDF8EE] p-3">
                  <p className="text-sm font-bold text-stone-800">Unsaved changes</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">Save this note before going back?</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setConfirmingDiscard(false); void saveDraft(); }} disabled={saving} className="min-h-11 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: '#7E9B86' }}>Save</button>
                    <button type="button" onClick={backToNotesHome} className="min-h-11 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-stone-600">Discard</button>
                  </div>
                </div>
              )}
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

              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <button type="button" onClick={() => void saveDraft()} disabled={saving} className="min-h-12 min-w-0 rounded-xl px-3 py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: '#7E9B86' }}>{saving ? 'Saving…' : 'Save note'}</button>
                <button type="button" onClick={() => void copyNote(draft)} className="min-h-12 min-w-0 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-600">Copy</button>
              </div>
              {notes.some(note => note.id === draft.id) && (
                <button type="button" onClick={() => void deleteDraft()} disabled={saving} className="min-h-11 w-full min-w-0 rounded-xl px-3 py-2 text-xs font-semibold" style={{ color: confirmDelete ? '#fff' : '#C96B7A', background: confirmDelete ? '#C96B7A' : '#FBEFF1' }}>
                  {confirmDelete ? 'Tap again to permanently delete' : 'Delete note'}
                </button>
              )}
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
                        {confirmDeleteId === note.id ? 'Confirm' : 'Delete'}
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
                        {...noteSwipeHandlers(note)}
                        onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); void startCleanup(note); }}
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
                          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
                            <button type="button" onClick={event => { event.stopPropagation(); void startCleanup(note); }} className="min-h-9 rounded-lg bg-stone-100 px-3 py-1 text-[10px] font-semibold text-stone-600">Clean up</button>
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
