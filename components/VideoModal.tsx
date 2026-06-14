'use client';

import { useEffect, useRef, useState } from 'react';

// Minimal YT IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          host?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onError?: (e: { data: number }) => void;
          };
        }
      ) => { destroy(): void };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Load the YT API script once globally
let ytReady = false;
let ytLoading = false;
const ytCallbacks: Array<() => void> = [];

function ensureYTApi(): Promise<void> {
  return new Promise((resolve) => {
    if (ytReady && window.YT) { resolve(); return; }
    ytCallbacks.push(resolve);
    if (ytLoading) return;
    ytLoading = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      ytReady = true;
      ytLoading = false;
      ytCallbacks.forEach(fn => fn());
      ytCallbacks.length = 0;
      if (prev) prev();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
}

interface Props {
  videoIds: string[];
  videoTitles: string[];
  exerciseName: string;
  tips: string[];
  onClose: () => void;
}

export default function VideoModal({ videoIds, videoTitles, exerciseName, tips, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [apiReady, setApiReady] = useState(ytReady);
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReturnType<typeof window.YT.Player> | null>(null);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const videoId = videoIds[idx] ?? '';
  const title = videoTitles[idx] ?? exerciseName;
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // Pre-load the YT API as soon as modal opens (while user reads tips)
  useEffect(() => {
    ensureYTApi().then(() => setApiReady(true));
  }, []);

  // Keyboard nav
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'ArrowLeft') navigate(-1);
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // Create / recreate YT player whenever idx changes while playing
  useEffect(() => {
    if (!playing || !apiReady) return;
    const container = playerContainerRef.current;
    if (!container || !window.YT) return;

    setEmbedBlocked(false);

    // Destroy old player
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch { /* already destroyed */ }
      playerRef.current = null;
    }

    // Fresh mount point
    container.innerHTML = '';
    const el = document.createElement('div');
    container.appendChild(el);

    playerRef.current = new window.YT.Player(el, {
      videoId: videoIds[idxRef.current],
      host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onError: (e) => {
          // 100 = not found, 101/150 = embedding disabled by owner
          if (e.data === 100 || e.data === 101 || e.data === 150) {
            setEmbedBlocked(true);
          }
        },
      },
    });

    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, apiReady, idx]);

  const navigate = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(videoIds.length - 1, idxRef.current + dir));
    if (next === idxRef.current) return;
    setEmbedBlocked(false);
    setIdx(next);
  };

  const tryNextVideo = () => {
    setEmbedBlocked(false);
    navigate(1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-0.5">{exerciseName}</p>
            <p className="text-sm font-semibold text-stone-800 leading-tight">{title}</p>
          </div>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
            className="text-stone-400 text-2xl leading-none w-8 h-8 flex items-center justify-center flex-shrink-0"
            style={{ touchAction: 'manipulation' }}
          >×</button>
        </div>

        {/* Video area */}
        <div className="aspect-video bg-black relative overflow-hidden">
          {!playing ? (
            // Thumbnail — tap to start
            <div
              className="absolute inset-0 cursor-pointer"
              onPointerDown={() => setPlaying(true)}
              style={{ touchAction: 'manipulation' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl} alt={title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-xl" style={{ background: 'rgba(255,255,255,0.92)' }}>
                  <svg viewBox="0 0 24 24" fill="#C17B4F" className="w-7 h-7 ml-1">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                </div>
                <p className="text-white text-xs font-semibold" style={{ opacity: 0.9 }}>Tap to play</p>
              </div>
            </div>
          ) : embedBlocked ? (
            // Embedding disabled by video owner
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6" style={{ background: '#111' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#D9A94B" strokeWidth="1.5" className="w-10 h-10">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
              </svg>
              <p className="text-white text-sm font-semibold text-center">
                This video's creator has disabled embedding in other apps.
              </p>
              <p className="text-stone-400 text-xs text-center">
                YouTube gives each creator control over where their videos can play.
              </p>
              {idx < videoIds.length - 1 ? (
                <button
                  onPointerDown={tryNextVideo}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white mt-1"
                  style={{ background: '#D9A94B', touchAction: 'manipulation' }}
                >
                  Try next video →
                </button>
              ) : (
                <p className="text-stone-500 text-xs text-center mt-1">No more videos available for this exercise.</p>
              )}
            </div>
          ) : (
            // YT player mount point
            <>
              {!apiReady && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#000' }}>
                  <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <div
                ref={playerContainerRef}
                className="absolute inset-0 w-full h-full"
              />
            </>
          )}
        </div>

        {/* Prev / Next */}
        {videoIds.length > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-stone-100" style={{ background: '#fafaf9' }}>
            <button
              onPointerDown={() => navigate(-1)}
              disabled={idx === 0}
              className="text-xs font-semibold py-2 pr-4 disabled:opacity-30"
              style={{ color: '#57534e', touchAction: 'manipulation' }}
            >‹ Prev</button>
            <span className="text-xs" style={{ color: '#a8a29e' }}>{idx + 1} / {videoIds.length} videos</span>
            <button
              onPointerDown={() => navigate(1)}
              disabled={idx === videoIds.length - 1}
              className="text-xs font-semibold py-2 pl-4 disabled:opacity-30"
              style={{ color: '#57534e', touchAction: 'manipulation' }}
            >Next ›</button>
          </div>
        )}

        {/* Tips */}
        {tips.length > 0 && (
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: '#a8a29e' }}>How to do it</p>
            <ol className="space-y-2.5">
              {tips.map((tip, i) => (
                <li key={i} className="flex gap-2.5 text-sm" style={{ color: '#44403c' }}>
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                    style={{ background: '#7E9B86' }}
                  >{i + 1}</span>
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
