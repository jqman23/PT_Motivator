'use client';

import { useState } from 'react';
import { Exercise } from '@/lib/exercises';
import VideoModal from './VideoModal';
import NotesModal from './NotesModal';
import ExerciseQuickInfoModal from './ExerciseQuickInfoModal';

interface Props {
  exercise: Exercise;
  done: boolean;
  note: string;
  today: string;
  onToggle: () => void;
  onNoteSave: (note: string) => void;
}

export default function ExerciseCard({ exercise, done, note, today, onToggle, onNoteSave }: Props) {
  const [showVideo, setShowVideo] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showQuickInfo, setShowQuickInfo] = useState(false);
  const isStrength = exercise.cat === 'strength';

  const cardColor = done
    ? isStrength ? 'bg-[#F4E3D6] border-[#C17B4F]/25' : 'bg-[#E4ECE6] border-[#7E9B86]/25'
    : 'bg-white border-stone-100';

  const checkColor = done
    ? isStrength ? 'bg-[#C17B4F] border-[#C17B4F]' : 'bg-[#7E9B86] border-[#7E9B86]'
    : 'bg-white border-stone-200';

  return (
    <>
      <div
        className={`rounded-2xl border p-3 flex items-center gap-3 transition-all duration-150 cursor-pointer select-none ${cardColor}`}
        onClick={onToggle}
      >
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
          </div>
          <p className="text-xs text-stone-400 mt-0.5 leading-snug">{exercise.cue}</p>
          {note && (
            <p className="text-xs text-stone-500 mt-1 italic leading-snug line-clamp-1">📝 {note}</p>
          )}
        </div>

        <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowNotes(true)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              note
                ? isStrength ? 'bg-[#C17B4F]/20 text-[#C17B4F]' : 'bg-[#7E9B86]/20 text-[#7E9B86]'
                : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
            }`}
            title="Add note"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M2 12.5V14h1.5l8-8L10 4.5l-8 8z"/><path d="M11.5 3l1.5 1.5"/>
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
        </div>
      </div>

      {showVideo && (
        <VideoModal exercise={exercise} onClose={() => setShowVideo(false)} />
      )}

      {showQuickInfo && (
        <ExerciseQuickInfoModal exercise={exercise} onClose={() => setShowQuickInfo(false)} />
      )}

      {showNotes && (
        <NotesModal
          exerciseName={exercise.name}
          exerciseId={exercise.id}
          date={today}
          initialNote={note}
          onSave={onNoteSave}
          onClose={() => setShowNotes(false)}
        />
      )}
    </>
  );
}
