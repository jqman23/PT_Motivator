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

  const videoId = videoIds[idx] ?? '';
  const title = videoTitles[idx] ?? exerciseName;
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-0.5">{exerciseName}</p>
            <p className="text-sm font-semibold text-stone-800 leading-tight">{title}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-2xl leading-none w-6 h-6 flex items-center justify-center flex-shrink-0">×</button>
        </div>

        {/* Thumbnail + Watch button */}
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl} alt={title} className="w-full aspect-video object-cover" />
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3">
            <a
              href={ytUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-[#FF0000] text-white px-5 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-[#cc0000] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 flex-shrink-0">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>
              </svg>
              Watch on YouTube
            </a>
            <p className="text-white/70 text-xs">Opens in YouTube app</p>
          </div>
        </div>

        {/* Navigation */}
        {videoIds.length > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-stone-100 bg-stone-50">
            <button
              onClick={() => setIdx((i) => Math.max(i - 1, 0))}
              disabled={idx === 0}
              className="text-xs font-semibold text-stone-500 disabled:opacity-30 hover:text-stone-800 transition-colors"
            >
              ‹ Prev video
            </button>
            <span className="text-xs text-stone-400">{idx + 1} / {videoIds.length}</span>
            <button
              onClick={() => setIdx((i) => Math.min(i + 1, videoIds.length - 1))}
              disabled={idx === videoIds.length - 1}
              className="text-xs font-semibold text-stone-500 disabled:opacity-30 hover:text-stone-800 transition-colors"
            >
              Next video ›
            </button>
          </div>
        )}

        {/* Tips */}
        {tips.length > 0 && (
          <div className="p-4 border-t border-stone-100 max-h-56 overflow-y-auto">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2.5">How to do it</p>
            <ol className="space-y-2">
              {tips.map((tip, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-stone-700">
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                    style={{ background: '#7E9B86' }}
                  >
                    {i + 1}
                  </span>
                  {tip}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
