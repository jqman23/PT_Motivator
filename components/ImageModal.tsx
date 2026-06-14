'use client';

import { useEffect } from 'react';
import { Exercise } from '@/lib/exercises';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

export default function ImageModal({ exercise, onClose }: Props) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-16 px-4 pb-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Exercise reference</p>
            <p className="text-sm font-bold text-stone-800 mt-0.5">{exercise.name}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-2xl leading-none w-7 h-7 flex items-center justify-center">×</button>
        </div>

        {/* Thumbnail grid */}
        <div className="p-3 grid grid-cols-3 gap-2">
          {exercise.videoIds.map((id, i) => {
            const thumbUrl = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            const ytUrl = `https://www.youtube.com/watch?v=${id}`;
            const title = exercise.videoTitles[i] ?? exercise.name;
            return (
              <a
                key={id}
                href={ytUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-xl overflow-hidden border border-stone-100 relative"
                title={title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbUrl} alt={title} className="w-full aspect-video object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="#C17B4F" className="w-3.5 h-3.5 ml-0.5">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4">
                  <p className="text-white text-[9px] font-medium leading-tight line-clamp-2">{title}</p>
                </div>
              </a>
            );
          })}
        </div>

        <div className="px-4 pb-3 pt-1">
          <p className="text-[10px] text-stone-400 text-center mb-2">Tap any image to watch the full video on YouTube</p>
          <a
            href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(exercise.imageSearch)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/>
            </svg>
            Search Google Images
          </a>
        </div>
      </div>
    </div>
  );
}
