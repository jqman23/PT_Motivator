'use client';

import { useEffect, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

interface WikiImage {
  url: string;
  title: string;
}

export default function ImageModal({ exercise, onClose }: Props) {
  const [images, setImages] = useState<WikiImage[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    setLoading(true);
    setImages([]);
    setIdx(0);

    // Step 1: search Wikimedia Commons for images matching this exercise
    const query = exercise.imageSearch;
    fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(query)}&srnamespace=6` +
      `&format=json&origin=*&srlimit=12`
    )
      .then(r => r.json())
      .then(async data => {
        const results: { title: string }[] = data.query?.search || [];
        // Filter to image formats only
        const imageFiles = results.filter(r => {
          const ext = r.title.split('.').pop()?.toLowerCase() ?? '';
          return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        });
        if (!imageFiles.length) { setLoading(false); return; }

        // Step 2: get proper thumbnail URLs for each file
        const titles = imageFiles.slice(0, 10).map(r => r.title).join('|');
        const infoRes = await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo` +
          `&iiprop=url&iiurlwidth=640&titles=${encodeURIComponent(titles)}` +
          `&format=json&origin=*`
        );
        const infoData = await infoRes.json();
        const pages = Object.values(infoData.query?.pages ?? {}) as Array<{
          title: string;
          imageinfo?: Array<{ thumburl?: string; url: string }>;
        }>;

        const imgs: WikiImage[] = pages
          .flatMap(p =>
            (p.imageinfo ?? []).map(ii => ({
              url: ii.thumburl ?? ii.url,
              title: (p.title ?? '').replace('File:', '').replace(/_/g, ' ').replace(/\.[^.]+$/, ''),
            }))
          )
          .filter(img => img.url);

        setImages(imgs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [exercise.imageSearch]);

  // Keyboard navigation
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, images.length - 1));
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose, images.length]);

  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const next = () => setIdx(i => Math.min(i + 1, images.length - 1));

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

  const total = images.length;
  const current = images[idx];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.93)' }}
      onClick={onClose}
      onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
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
          {current && (
            <p className="text-sm font-semibold pr-10 leading-snug" style={{ color: '#fff' }}>
              {current.title}
            </p>
          )}
        </div>

        {/* Image area */}
        <div
          className="mx-4 rounded-2xl overflow-hidden relative flex items-center justify-center"
          style={{ background: '#111', minHeight: 220 }}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" style={{ opacity: 0.4 }} />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Searching images…</p>
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 px-6">
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" className="w-10 h-10">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
              <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>No images found</p>
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={current?.url}
                src={current?.url}
                alt={current?.title}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                  maxHeight: '55vh',
                  objectFit: 'contain',
                }}
              />

              {/* Prev / Next arrows */}
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
            </>
          )}
        </div>

        {/* Dot indicators */}
        {total > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {images.map((_, i) => (
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
          {loading ? '' : total === 0 ? '' : `${idx + 1} of ${total}${total > 1 ? ' · swipe or tap arrows' : ''}`}
        </p>
      </div>
    </div>
  );
}
