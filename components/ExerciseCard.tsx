'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig } from '@/lib/layout';
import { getExerciseTypeTheme, normalizeExerciseType } from '@/lib/exerciseTypes';
import VideoModal from './VideoModal';
import NotesModal from './NotesModal';
import ExerciseQuickInfoModal from './ExerciseQuickInfoModal';
import ExerciseHistoryModal from './ExerciseHistoryModal';
import ExerciseEditModal from './ExerciseEditModal';

interface Props {
  exercise: Exercise;
  done: boolean;
  note: string;
  today: string;
  onToggle: () => void;
  onNoteSave: (note: string) => void;
  onMoveExercise?: (exerciseId: string, direction: -1 | 1) => Promise<boolean> | boolean;
  typeOptions: string[];
}

const SWIPE_REVEAL = 92;
const SWIPE_THRESHOLD = 44;
const HISTORY_HOLD_MS = 2000;

async function getConfigValue<T>(key: string, fallback: T): Promise<T> {
  const res = await fetch(`/api/config?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
  const data = await res.json();
  return data.value ?? fallback;
}

async function saveConfigValue(key: string, value: unknown) {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`Could not save ${key}`);
}

export default function ExerciseCard({ exercise, done, note, today, onToggle, onNoteSave, onMoveExercise, typeOptions }: Props) {
  const [showVideo, setShowVideo] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showQuickInfo, setShowQuickInfo] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [typeDraft, setTypeDraft] = useState(normalizeExerciseType(exercise.cat));
  const [showRemoveOptions, setShowRemoveOptions] = useState(false);
  const [showMoveControls, setShowMoveControls] = useState(false);
  const [removeBusy, setRemoveBusy] = useState<'hide' | 'library' | null>(null);
  const [removeError, setRemoveError] = useState('');
  const [moveBusy, setMoveBusy] = useState<'up' | 'down' | null>(null);
  const [moveFeedback, setMoveFeedback] = useState('');
  const [swipeX, setSwipeX] = useState(0);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClick = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  const cardColor = done
    ? 'bg-[#E4ECE6] border-[#7E9B86]/25'
    : 'bg-white border-stone-100';

  const checkColor = done
    ? 'bg-[#7E9B86] border-[#7E9B86]'
    : 'bg-white border-stone-200';
  const typeTheme = getExerciseTypeTheme(exercise.cat);

  const closeSwipe = () => {
    setSwipeX(0);
    setSwipeOpen(false);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const openHistory = (suppressClick = false) => {
    if (swiping.current) return;
    if (suppressClick) suppressNextClick.current = true;
    closeSwipe();
    setShowHistory(true);
  };

  const stopActionPointer = (e: PointerEvent<HTMLDivElement>) => {
    clearLongPress();
    e.stopPropagation();
  };

  useEffect(() => {
    const handleTimerNoteSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ exerciseId?: string }>).detail;
      if (detail?.exerciseId === exercise.id && !done) onToggle();
    };

    window.addEventListener('pt-timer-note-saved', handleTimerNoteSaved);
    return () => window.removeEventListener('pt-timer-note-saved', handleTimerNoteSaved);
  }, [done, exercise.id, onToggle]);

  useEffect(() => {
    setTypeDraft(normalizeExerciseType(exercise.cat));
  }, [exercise.cat, exercise.id]);

  const moveWithinSection = async (direction: -1 | 1) => {
    if (moveBusy) return;
    setMoveBusy(direction === -1 ? 'up' : 'down');
    setMoveFeedback('Saving…');

    try {
      const moved = onMoveExercise ? await onMoveExercise(exercise.id, direction) : false;
      if (!moved) {
        setMoveFeedback(direction === -1 ? 'Top' : 'Bottom');
      } else {
        setMoveFeedback('Saved ✓');
      }
      window.setTimeout(() => setMoveFeedback(''), 1200);
    } catch (err) {
      console.error(err);
      setMoveFeedback('Save failed');
      window.setTimeout(() => setMoveFeedback(''), 1500);
    } finally {
      setMoveBusy(null);
    }
  };

  const hideFromHomeScreen = async () => {
    setRemoveBusy('hide');
    setRemoveError('');
    try {
      const layout = await getConfigValue<CategoryConfig[]>('layout', []);
      const nextLayout = Array.isArray(layout)
        ? layout.map(cat => ({ ...cat, exerciseIds: cat.exerciseIds.filter(id => id !== exercise.id) }))
        : [];
      await saveConfigValue('layout', nextLayout);
      window.location.reload();
    } catch (err) {
      console.error(err);
      setRemoveError('Could not remove from Home Screen.');
      setRemoveBusy(null);
    }
  };

  const removeFromLibraryEverywhere = async () => {
    setRemoveBusy('library');
    setRemoveError('');
    try {
      const [layout, library] = await Promise.all([
        getConfigValue<CategoryConfig[]>('layout', []),
        getConfigValue<Exercise[]>('exerciseLibrary', []),
      ]);
      const nextLayout = Array.isArray(layout)
        ? layout.map(cat => ({ ...cat, exerciseIds: cat.exerciseIds.filter(id => id !== exercise.id) }))
        : [];
      const nextLibrary = Array.isArray(library) ? library.filter(ex => ex.id !== exercise.id) : [];

      await Promise.all([
        saveConfigValue('layout', nextLayout),
        saveConfigValue('exerciseLibrary', nextLibrary),
      ]);
      window.location.reload();
    } catch (err) {
      console.error(err);
      setRemoveError('Could not remove exercise from library.');
      setRemoveBusy(null);
    }
  };

  const saveType = async (nextType: string) => {
    const cleanType = normalizeExerciseType(nextType);
    try {
      const res = await fetch('/api/config?key=exerciseLibrary', { cache: 'no-store' });
      const data = await res.json();
      const library: Exercise[] = Array.isArray(data.value) ? data.value : [];
      const next = library.map(ex => ex.id === exercise.id ? { ...ex, cat: cleanType } : ex);
      const post = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'exerciseLibrary', value: next }),
      });
      if (!post.ok) throw new Error('Could not save type');
      window.location.reload();
    } catch (err) {
      console.error(err);
      setRemoveError('Could not save type.');
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl sm:overflow-visible" data-exercise-card-wrap>
        <div className="absolute inset-y-0 right-0 w-[92px] flex sm:hidden items-center justify-end bg-red-500 rounded-2xl pr-3">
          <button
            onClick={() => { closeSwipe(); setShowRemoveOptions(true); }}
            className="text-xs font-bold text-white px-2 py-2 rounded-xl"
            style={{ touchAction: 'manipulation' }}
          >
            Remove
          </button>
        </div>

        <div
          data-exercise-card-id={exercise.id}
          className={`rounded-2xl border p-3 flex items-center gap-3 transition-all duration-150 cursor-pointer select-none ${cardColor} ${showMoveControls ? 'ring-2 ring-[#7E9B86]/25 shadow-md' : ''}`}
          style={{ transform: `translateX(${swipeX}px)`, touchAction: 'pan-y' }}
          onClick={() => {
            if (suppressNextClick.current) {
              suppressNextClick.current = false;
              return;
            }
            if (swipeOpen) {
              closeSwipe();
              return;
            }
            if (showMoveControls) {
              setShowMoveControls(false);
              return;
            }
            onToggle();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            openHistory(false);
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') return;
            touchStart.current = { x: e.clientX, y: e.clientY };
            swiping.current = false;
            clearLongPress();
            longPressTimer.current = setTimeout(() => openHistory(true), HISTORY_HOLD_MS);
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || !touchStart.current) return;
            const dx = e.clientX - touchStart.current.x;
            const dy = e.clientY - touchStart.current.y;
            const absX = Math.abs(dx);
            const absY = Math.abs(dy);

            if (absX > 12 && absX > absY) {
              swiping.current = true;
              suppressNextClick.current = true;
              clearLongPress();
              setShowMoveControls(false);
              const base = swipeOpen ? -SWIPE_REVEAL : 0;
              const next = Math.min(0, Math.max(-SWIPE_REVEAL, base + dx));
              setSwipeX(next);
            }
          }}
          onPointerUp={() => {
            clearLongPress();
            touchStart.current = null;
            if (swiping.current) {
              const shouldOpen = swipeX < -SWIPE_THRESHOLD;
              setSwipeOpen(shouldOpen);
              setSwipeX(shouldOpen ? -SWIPE_REVEAL : 0);
              swiping.current = false;
            }
          }}
          onPointerCancel={() => {
            clearLongPress();
            touchStart.current = null;
            swiping.current = false;
            setSwipeX(swipeOpen ? -SWIPE_REVEAL : 0);
          }}
          onPointerLeave={clearLongPress}
          title="Tap to check off. Tap the grip on mobile to move up/down. Hold for history. Swipe left on mobile to remove."
        >
          <div
            className={`sm:hidden flex-shrink-0 w-7 h-10 rounded-xl flex items-center justify-center transition-all ${showMoveControls ? 'bg-[#E4ECE6] text-[#7E9B86]' : 'text-stone-300'}`}
            style={{ touchAction: 'manipulation' }}
            title="Move exercise"
            onClick={(e) => {
              e.stopPropagation();
              suppressNextClick.current = true;
              closeSwipe();
              setShowMoveControls(prev => !prev);
            }}
            onPointerDown={(e) => {
              clearLongPress();
              e.stopPropagation();
            }}
          >
            <svg viewBox="0 0 12 18" fill="currentColor" className="w-3 h-4">
              <circle cx="3" cy="4" r="1.4" />
              <circle cx="9" cy="4" r="1.4" />
              <circle cx="3" cy="9" r="1.4" />
              <circle cx="9" cy="9" r="1.4" />
              <circle cx="3" cy="14" r="1.4" />
              <circle cx="9" cy="14" r="1.4" />
            </svg>
          </div>

          <div className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-150 ${checkColor}`}>
            {done && (
              <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="2.5 8 6.5 12 13.5 4" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-sm font-semibold leading-tight ${done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                {exercise.name}
              </span>
              {exercise.optional && <span className="text-xs text-stone-400">(optional)</span>}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setTypeDraft(normalizeExerciseType(exercise.cat)); setShowTypePicker(true); }}
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
                style={{
                  background: typeTheme.light,
                  color: typeTheme.accent,
                  borderColor: `${typeTheme.accent}22`,
                  touchAction: 'manipulation',
                }}
                title="Change type"
              >
                {normalizeExerciseType(exercise.cat)}
              </button>
            </div>
            <p className="text-xs text-stone-400 mt-0.5 leading-snug">{exercise.cue}</p>
            {note && (
              <p className="text-xs text-stone-500 mt-1 italic leading-snug line-clamp-1">📝 {note}</p>
            )}
            {showMoveControls && (
              <div className="sm:hidden mt-2 flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); void moveWithinSection(-1); }}
                  disabled={!!moveBusy}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold disabled:opacity-50"
                  style={{ background: '#E4ECE6', color: '#476653', touchAction: 'manipulation' }}
                >
                  {moveBusy === 'up' ? 'Saving…' : '↑ Up'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void moveWithinSection(1); }}
                  disabled={!!moveBusy}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold disabled:opacity-50"
                  style={{ background: '#E4ECE6', color: '#476653', touchAction: 'manipulation' }}
                >
                  {moveBusy === 'down' ? 'Saving…' : '↓ Down'}
                </button>
                {moveFeedback && <span className="text-[11px] font-semibold text-stone-400">{moveFeedback}</span>}
              </div>
            )}
          </div>

          <div
            className="relative flex gap-1.5 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            onPointerDown={stopActionPointer}
            onPointerUp={stopActionPointer}
            onPointerCancel={stopActionPointer}
          >
            <button
              onClick={() => setShowNotes(true)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                note
                  ? 'bg-[#7E9B86]/20 text-[#7E9B86]'
                  : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
              }`}
              title="Add note"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M4 2.5h6.5L13 5v8.5H4z" />
                <path d="M10.5 2.5V5H13" />
                <path d="M6 7.5h5M6 10h4" />
              </svg>
            </button>

            <button
              onClick={() => setShowEdit(true)}
              className="w-7 h-7 rounded-lg bg-stone-100 text-stone-400 hover:bg-stone-200 flex items-center justify-center transition-colors"
              title="Edit exercise"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M2.5 11.7V14h2.3L12 6.8 9.7 4.5z" />
                <path d="M11 3.2l1.8 1.8" />
              </svg>
            </button>

            <button
              onClick={() => setShowVideo(true)}
              className="w-7 h-7 rounded-lg bg-stone-100 text-stone-400 hover:bg-stone-200 flex items-center justify-center transition-colors"
              title="Watch video"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <circle cx="8" cy="8" r="6"/>
                <polygon points="6.5,5.5 11,8 6.5,10.5" fill="currentColor" stroke="none"/>
              </svg>
            </button>

            <button
              onClick={() => setShowQuickInfo(true)}
              className="w-7 h-7 rounded-lg bg-stone-100 text-stone-400 hover:bg-stone-200 flex items-center justify-center transition-colors"
              title="Exercise info"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <circle cx="8" cy="8" r="6"/>
                <path d="M8 7.5v4M8 4.7h.01"/>
              </svg>
            </button>

            {(exercise.mainImageUrls?.[0] || exercise.mainImageUrl) && (
              <div data-mobile-action-preview="true" className="absolute right-0 top-full mt-2 hidden w-24 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg sm:hidden">
                <img
                  src={exercise.mainImageUrls?.[0] || exercise.mainImageUrl || ''}
                  alt=""
                  className="h-14 w-full object-cover bg-stone-100"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {showRemoveOptions && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:hidden" onClick={() => setShowRemoveOptions(false)}>
          <div className="w-full rounded-t-2xl bg-[#F6F1E7] border-t border-stone-200 p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Remove exercise</p>
            <h2 className="font-serif text-lg font-semibold text-stone-800 leading-tight mt-0.5">{exercise.name}</h2>
            <p className="text-xs text-stone-500 mt-1 leading-snug">
              Hide removes it from Home Screen categories only. Remove from library removes it from the editable library and all Home Screen categories.
            </p>
            {removeError && <p className="mt-3 text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{removeError}</p>}
            <div className="mt-4 space-y-2">
              <button onClick={hideFromHomeScreen} disabled={!!removeBusy} className="w-full py-3 rounded-xl text-sm font-bold text-[#7E9B86] bg-[#E4ECE6] disabled:opacity-50" style={{ touchAction: 'manipulation' }}>
                {removeBusy === 'hide' ? 'Removing…' : 'Hide from Home Screen'}
              </button>
              <button onClick={removeFromLibraryEverywhere} disabled={!!removeBusy} className="w-full py-3 rounded-xl text-sm font-bold text-white bg-red-500 disabled:opacity-50" style={{ touchAction: 'manipulation' }}>
                {removeBusy === 'library' ? 'Removing…' : 'Remove from library'}
              </button>
              <button onClick={() => setShowRemoveOptions(false)} disabled={!!removeBusy} className="w-full py-3 rounded-xl text-sm font-semibold text-stone-500 bg-white border border-stone-100 disabled:opacity-50" style={{ touchAction: 'manipulation' }}>
                Cancel
              </button>
            </div>
            {(exercise.mainImageUrls?.[0] || exercise.mainImageUrl) && (
              <div className="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white">
                <div className="flex items-center gap-2 px-2 py-2">
                  <img
                    src={exercise.mainImageUrls?.[0] || exercise.mainImageUrl || ''}
                    alt={`${exercise.name} preview`}
                    className="h-10 w-16 flex-shrink-0 rounded-lg object-cover bg-stone-100"
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Main photo</p>
                    <p className="text-[11px] text-stone-500 truncate">Shown at the top of the exercise</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showTypePicker && (
        <div className="fixed inset-0 z-[82] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8" onClick={() => setShowTypePicker(false)}>
          <div className="w-full rounded-t-2xl bg-[#F6F1E7] border-t border-stone-200 p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Edit type</p>
            <h2 className="font-serif text-lg font-semibold text-stone-800 leading-tight mt-0.5">{exercise.name}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from(new Set([normalizeExerciseType(exercise.cat), ...typeOptions])).slice(0, 12).map(type => {
                const theme = getExerciseTypeTheme(type);
                const selected = normalizeExerciseType(typeDraft) === normalizeExerciseType(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeDraft(type)}
                    className="rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest"
                    style={{
                      background: selected ? theme.accent : theme.light,
                      color: selected ? '#fff' : theme.accent,
                      borderColor: selected ? theme.accent : `${theme.accent}22`,
                      touchAction: 'manipulation',
                    }}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            <input
              value={typeDraft}
              onChange={e => setTypeDraft(e.target.value)}
              placeholder="Custom type"
              className="mt-3 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm"
              style={{ fontSize: 16 }}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => { void saveType(typeDraft); }}
                className="rounded-xl px-3 py-3 text-sm font-bold text-white"
                style={{ background: '#7E9B86', touchAction: 'manipulation' }}
              >
                Save type
              </button>
              <button
                onClick={() => setShowTypePicker(false)}
                className="rounded-xl border border-stone-100 bg-white px-3 py-3 text-sm font-semibold text-stone-500"
                style={{ touchAction: 'manipulation' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showVideo && (
        <VideoModal exercise={exercise} onClose={() => setShowVideo(false)} />
      )}

      {showQuickInfo && (
        <ExerciseQuickInfoModal exercise={exercise} onClose={() => setShowQuickInfo(false)} />
      )}

      {showHistory && (
        <ExerciseHistoryModal exercise={exercise} onClose={() => setShowHistory(false)} />
      )}

      {showEdit && (
        <ExerciseEditModal exercise={exercise} onClose={() => setShowEdit(false)} />
      )}

      {showNotes && (
        <NotesModal
          exerciseName={exercise.name}
          exerciseId={exercise.id}
          date={today}
          initialNote={note}
          exerciseSets={exercise.sets ?? ''}
          exerciseCue={exercise.cue ?? ''}
          exerciseTips={exercise.tips ?? []}
          onSave={onNoteSave}
          onClose={() => setShowNotes(false)}
        />
      )}
    </>
  );
}
