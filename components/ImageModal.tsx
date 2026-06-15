'use client';

import { useEffect, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { VideoResult } from '@/app/api/yt-search/route';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

export default function ImageModal({ exercise, onClose }: Props) {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [noKey, setNoKey] = useState(false);
  const [idx, setIdx] = useState(0);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const query = `${exercise.imageSearch} exercise demonstration`;

  useEffect(() => {
    setLoading(true);
    setNoKey(false);
    setVideos([]);
    setIdx(0);

    fetch(`/api/yt-search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        if (data.noKey) setNoKey(true);
        setVideos(data.videos ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, videos.length - 1));
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose, videos.length]);

  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const next = () => setIdx(i => Math.min(i + 1, videos.length - 1));

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

  const total = videos.length;
  const current = videos[idx];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.97)', touchAction: 'manipulation' }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="flex items-center justify-between px-5 pt-safe pt-4 pb-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Image Reference
          </p>
          <p className="text-sm font-semibold text-white leading-tight">{exercise.name}</p>
        </div>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-2xl leading-none"
          style={{ background: 'rgba(255,255,255,0.12)', touchAction: 'manipulation' }}
        >×</button>
      </div>

      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        style={{ userSelect: 'none', minHeight: 0 }}
      >
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" style={{ opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Searching images…</p>
          </div>
        )}

        {!loading && noKey && (
          <div className="flex flex-col items-center gap-4 px-8 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" className="w-7 h-7">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>YouTube API key needed</p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Add <code className="bg-white/10 px-1 py-0.5 rounded">YOUTUBE_API_KEY</code> to your Vercel environment variables.
              </p>
            </div>
          </div>
        )}

        {!loading && !noKey && total === 0 && (
          <div className="flex flex-col items-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" className="w-12 h-12">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No images found</p>
          </div>
        )}

        {!loading && current && (
          <>
            <div
              className="rounded-2xl overflow-hidden w-full"
              style={{ maxHeight: '55vh' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <img
                key={current.id}
                src={current.thumbnail}
                alt={current.title}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                  maxHeight: '55vh',
                  objectFit: 'contain',
                }}
              />
            </div>

            {total > 1 && (
              <>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); prev(); }}
                  disabled={idx === 0}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-20"
                  style={{ background: 'rgba(0,0,0,0.55)', touchAction: 'manipulation', fontSize: 22, color: '#fff' }}
                >‹</button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); next(); }}
                  disabled={idx === total - 1}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-20"
                  style={{ background: 'rgba(0,0,0,0.55)', touchAction: 'manipulation', fontSize: 22, color: '#fff' }}
                >›</button>
              </>
            )}
          </>
        )}
      </div>

      {!loading && current && (
        <div
          className="flex-shrink-0 px-5 pb-safe pb-5 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-semibold text-center leading-snug px-6 mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {current.title}
          </p>
          <p className="text-[11px] text-center mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {current.channel}
          </p>

          {total > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              {videos.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx(i); }}
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: i === idx ? 22 : 8,
                    height: 8,
                    background: i === idx ? '#D9A94B' : 'rgba(255,255,255,0.25)',
                    touchAction: 'manipulation',
                  }}
                />
              ))}
            </div>
          )}

          <p className="text-[10px] text-center mt-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {total > 1 ? `${idx + 1} of ${total} · swipe or tap arrows` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
