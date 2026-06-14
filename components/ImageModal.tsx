'use client';

import { useEffect, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

// hqdefault (480×360) is always available for every real YouTube video.
// YouTube returns a 120×90 gray placeholder for invalid/deleted video IDs.
function thumbUrl(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export default function ImageModal({ exercise, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [imgInvalid, setImgInvalid] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const total = exercise.videoIds.length;
  const videoId = exercise.videoIds[idx] ?? '';
  const title = exercise.videoTitles[idx] ?? exercise.name;

  // Reset validity check when switching images
  useEffect(() => setImgInvalid(false), [idx]);

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

  // Detect YouTube's 120×90 placeholder for invalid/deleted video IDs
  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (e.currentTarget.naturalWidth <= 120) setImgInvalid(true);
  };

  // Close backdrop: preventDefault on touchEnd cancels the ghost click on mobile
  const handleBackdropTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.93)' }}
      onClick={onClose}
      onTouchEnd={handleBackdropTouchEnd}
    >
      <div
        className="relative w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={(e) => { e.stopPropagation(); handleTouchEnd(e); }}
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
        <div className="mx-4 rounded-2xl overflow-hidden relative" style={{ background: '#111', minHeight: 200 }}>
          {imgInvalid ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 px-6">
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" className="w-10 h-10">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9l4-4 4 4 4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8.5" cy="13.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-xs font-medium text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Preview not available
              </p>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={videoId}
              src={thumbUrl(videoId)}
              alt={title}
              onLoad={handleImgLoad}
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                maxHeight: '55vh',
                minHeight: 180,
                objectFit: 'contain',
              }}
            />
          )}

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
