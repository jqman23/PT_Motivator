'use client';

import { useEffect, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

export default function ImageModal({ exercise, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const total = exercise.videoIds.length;
  const videoId = exercise.videoIds[idx] ?? '';
  const title = exercise.videoTitles[idx] ?? exercise.name;

  // Try sddefault (640×480), fall back to hqdefault (480×360) on error
  const [imgSrc, setImgSrc] = useState(`https://img.youtube.com/vi/${videoId}/sddefault.jpg`);

  useEffect(() => {
    setImgSrc(`https://img.youtube.com/vi/${exercise.videoIds[idx] ?? ''}/sddefault.jpg`);
  }, [idx, exercise.videoIds]);

  // Keyboard nav
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const next = () => setIdx(i => Math.min(i + 1, total - 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dy > 60) return; // vertical scroll, ignore
    if (dx > 50) prev();
    else if (dx < -50) next();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onPointerDown={onClose}
    >
      <div
        className="relative w-full max-w-lg flex flex-col"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ userSelect: 'none' }}
      >
        {/* Close button */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center text-white text-xl font-light"
          style={{ background: 'rgba(0,0,0,0.6)', touchAction: 'manipulation' }}
        >×</button>

        {/* Exercise label */}
        <div className="px-5 pt-5 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {exercise.name}
          </p>
          <p className="text-sm font-semibold leading-tight" style={{ color: '#fff' }}>{title}</p>
        </div>

        {/* Main image */}
        <div className="relative mx-4 rounded-2xl overflow-hidden" style={{ background: '#111' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={imgSrc}
            src={imgSrc}
            alt={title}
            className="w-full object-contain"
            style={{ display: 'block', maxHeight: '55vh' }}
            onError={() => {
              if (!imgSrc.includes('hqdefault')) {
                setImgSrc(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
              }
            }}
          />

          {/* Prev / Next overlay arrows */}
          {total > 1 && (
            <>
              <button
                onPointerDown={(e) => { e.stopPropagation(); prev(); }}
                disabled={idx === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold disabled:opacity-20"
                style={{ background: 'rgba(0,0,0,0.55)', touchAction: 'manipulation' }}
              >‹</button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); next(); }}
                disabled={idx === total - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold disabled:opacity-20"
                style={{ background: 'rgba(0,0,0,0.55)', touchAction: 'manipulation' }}
              >›</button>
            </>
          )}
        </div>

        {/* Dot indicators + count */}
        {total > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {exercise.videoIds.map((_, i) => (
              <button
                key={i}
                onPointerDown={(e) => { e.stopPropagation(); setIdx(i); }}
                className="rounded-full transition-all"
                style={{
                  width: i === idx ? 20 : 7,
                  height: 7,
                  background: i === idx ? '#D9A94B' : 'rgba(255,255,255,0.3)',
                  touchAction: 'manipulation',
                }}
              />
            ))}
          </div>
        )}

        <p className="text-center text-xs mt-3 pb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {idx + 1} of {total} · swipe to browse
        </p>
      </div>
    </div>
  );
}
