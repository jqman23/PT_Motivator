'use client';

import { useEffect, useState } from 'react';

interface Props {
  videoIds: string[];
  videoTitles: string[];
  exerciseName: string;
  tips: string[];
  onClose: () => void;
}

export default function VideoModal({ videoIds, videoTitles, exerciseName, tips, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const videoId = videoIds[idx] ?? '';
  const title = videoTitles[idx] ?? exerciseName;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`;
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  useEffect(() => {
    setLoaded(false);
  }, [idx]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(i + 1, videoIds.length - 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose, videoIds.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-0.5">{exerciseName}</p>
            <p className="text-sm font-semibold text-stone-800 leading-tight">{title}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            <a href={ytUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#7E9B86] font-semibold hover:underline whitespace-nowrap">
              YouTube ↗
            </a>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-2xl leading-none w-6 h-6 flex items-center justify-center">×</button>
          </div>
        </div>

        {/* Video */}
        <div className="aspect-video bg-black relative">
          {!loaded ? (
            <div className="absolute inset-0 cursor-pointer group" onClick={() => setLoaded(true)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl} alt={title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <svg viewBox="0 0 24 24" fill="#C17B4F" className="w-7 h-7 ml-1">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                </div>
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-white text-xs font-medium opacity-80">
                Tap to play
              </p>
            </div>
          ) : (
            <iframe
              src={embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          )}
        </div>

        {/* Navigation */}
        {videoIds.length > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-stone-100 bg-stone-50">
            <button
              onClick={() => { setIdx((i) => Math.max(i - 1, 0)); }}
              disabled={idx === 0}
              className="text-xs font-semibold text-stone-500 disabled:opacity-30 hover:text-stone-800 transition-colors flex items-center gap-1"
            >
              ‹ Prev
            </button>
            <span className="text-xs text-stone-400">{idx + 1} / {videoIds.length} videos</span>
            <button
              onClick={() => { setIdx((i) => Math.min(i + 1, videoIds.length - 1)); }}
              disabled={idx === videoIds.length - 1}
              className="text-xs font-semibold text-stone-500 disabled:opacity-30 hover:text-stone-800 transition-colors flex items-center gap-1"
            >
              Next ›
            </button>
          </div>
        )}

        {/* Tips */}
        {tips.length > 0 && (
          <div className="p-4 border-t border-stone-100">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">Tips</p>
            <ul className="space-y-1.5">
              {tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-stone-700">
                  <span className="text-[#7E9B86] flex-shrink-0">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
