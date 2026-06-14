'use client';

import { useEffect, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

// hqdefault (480×360) is ALWAYS available for every YouTube video — never 404s
function thumbUrl(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export default function ImageModal({ exercise, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const total = exercise.videoIds.length;
  const videoId = exercise.videoIds[idx] ?? '';
  const title = exercise.videoTitles[idx] ?? exercise.name;

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, total - 1));
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, total]);

  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const next = () => setIdx(i => Math.min(i + 1, total - 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dy > 60) return;
    if (dx > 50) prev();
    else if (dx < -50) next();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.93)' }}
      onPointerDown={onClose}
    >
      <div
        className="relative w-full max-w-lg flex flex-col"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ userSelect: 'none' }}
      >
        {/* Close */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center text-white text-xl"
          style={{ background: 'rgba(0,0,0,0.7)', touchAction: 'manipulation' }}
        >×</button>

        {/* Label */}
        <div className="px-5 pt-5 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {exercise.name}
          </p>
          <p className="text-sm font-semibold" style={{ color: '#fff' }}>{title}</p>
        </div>

        {/* Thumbnail */}
        <div className="mx-4 rounded-2xl overflow-hidden relative" style={{ background: '#000' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={videoId}
            src={thumbUrl(videoId)}
            alt={title}
            className="w-full object-cover"
            style={{ display: 'block', maxHeight: '55vh', minHeight: 180, width: '100%' }}
          />

          {/* Prev / Next arrows on image */}
          {total > 1 && (
            <>
              <button
                onPointerDown={(e) => { e.stopPropagation(); prev(); }}
                disabled={idx === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold disabled:opacity-20"
                style={{ background: 'rgba(0,0,0,0.6)', fontSize: 20, touchAction: 'manipulation' }}
              >‹</button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); next(); }}
                disabled={idx === total - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold disabled:opacity-20"
                style={{ background: 'rgba(0,0,0,0.6)', fontSize: 20, touchAction: 'manipulation' }}
              >›</button>
            </>
          )}
        </div>

        {/* Dot indicators */}
        {total > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {exercise.videoIds.map((_, i) => (
              <button
                key={i}
                onPointerDown={(e) => { e.stopPropagation(); setIdx(i); }}
                className="rounded-full transition-all"
                style={{
                  width: i === idx ? 22 : 8,
                  height: 8,
                  background: i === idx ? '#D9A94B' : 'rgba(255,255,255,0.3)',
                  touchAction: 'manipulation',
                }}
              />
            ))}
          </div>
        )}

        <p className="text-center text-xs mt-3 pb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {idx + 1} of {total}{total > 1 ? ' · swipe or tap arrows' : ''}
        </p>
      </div>
    </div>
  );
}
