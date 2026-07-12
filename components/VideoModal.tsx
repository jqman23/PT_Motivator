'use client';

import { useEffect, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { VideoResult } from '@/app/api/yt-search/route';
import { exerciseVideoSource, youtubeIdFromUrl, youtubeThumbnailUrl } from '@/lib/media';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

export default function VideoModal({ exercise, onClose }: Props) {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingPrimary, setPlayingPrimary] = useState(false);
  const mainSource = exerciseVideoSource(exercise.mainVideoUrl);
  const mainVideoId = youtubeIdFromUrl(exercise.mainVideoUrl);
  const mainVideo: VideoResult | null = mainVideoId ? {
    id: mainVideoId,
    title: `${exercise.name} main video`,
    channel: 'Selected in Master Database',
    thumbnail: youtubeThumbnailUrl(exercise.mainVideoUrl),
  } : null;
  const allVideos = mainVideo ? [mainVideo, ...videos.filter(video => video.id !== mainVideo.id)] : videos;

  const query = `${exercise.imageSearch} how to exercise physical therapy`;

  useEffect(() => {
    fetch(`/api/yt-search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        if (data.noKey) {
          setError('noKey');
        } else if (data.error) {
          setError(data.error);
        } else {
          setVideos(data.videos ?? []);
        }
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (playingId || playingPrimary) { setPlayingId(null); setPlayingPrimary(false); }
        else onClose();
      }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose, playingId, playingPrimary]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={() => onClose()}
    >
      <div
        className="bg-white w-full sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-stone-100 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-0.5">
              {playingId || playingPrimary ? 'Now Playing' : 'Video Guide'}
            </p>
            <p className="text-sm font-semibold text-stone-800 leading-tight truncate">
              {playingId
                ? (allVideos.find(v => v.id === playingId)?.title ?? exercise.name)
                : playingPrimary ? `${exercise.name} main video`
                : exercise.name}
            </p>
            {(playingId || playingPrimary) && (
              <p className="text-[11px] text-stone-400 truncate">
                {playingId ? allVideos.find(v => v.id === playingId)?.channel : mainSource?.label}
              </p>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); if (playingId || playingPrimary) { setPlayingId(null); setPlayingPrimary(false); } else onClose(); }}
            className="w-9 h-9 rounded-xl bg-stone-100 text-stone-500 flex items-center justify-center flex-shrink-0 text-xl leading-none font-light"
            style={{ touchAction: 'manipulation' }}
          >
            {playingId || playingPrimary ? (
              // Back arrow
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                <path d="M12 4L6 10l6 6" />
              </svg>
            ) : '×'}
          </button>
        </div>

        {/* ── Player (when a video is selected) ── */}
        {(playingId || (playingPrimary && mainSource)) && (
          <div className="flex-shrink-0" style={{ background: '#000' }}>
            <div
              className="relative"
              style={playingPrimary && mainSource?.kind === 'instagram'
                ? { height: 'min(68dvh, 680px)' }
                : { paddingBottom: '56.25%' }}
            >
              {playingId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${playingId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                  title={allVideos.find(v => v.id === playingId)?.title ?? exercise.name}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 block h-full w-full border-0"
                />
              ) : mainSource?.kind === 'direct' ? (
                <video src={mainSource.url} controls autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" />
              ) : mainSource?.embedUrl ? (
                <iframe
                  src={mainSource.embedUrl}
                  title={`${exercise.name} main video`}
                  allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 block h-full w-full border-0"
                />
              ) : null}
            </div>
            {playingPrimary && mainSource && (
              <a href={mainSource.url} target="_blank" rel="noreferrer" className="block bg-stone-900 px-3 py-2 text-center text-[11px] font-semibold text-stone-200">
                Open original on {mainSource.label}
              </a>
            )}
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          {mainSource && mainSource.kind !== 'youtube' && (
            <div className="border-b border-stone-100 bg-[#F8F1E6] p-4">
              {mainSource.kind === 'external' ? (
                <a href={mainSource.url} target="_blank" rel="noreferrer" className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm">
                  <span><span className="block text-sm font-semibold text-stone-800">{exercise.name} main video</span><span className="block text-[11px] text-stone-400">Open on {mainSource.label}</span></span>
                  <span className="text-xl text-[#C17B4F]">↗</span>
                </a>
              ) : (
                <button onClick={() => setPlayingPrimary(true)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm" style={{ touchAction: 'manipulation' }}>
                  <span><span className="block text-sm font-semibold text-stone-800">{exercise.name} main video</span><span className="block text-[11px] text-stone-400">Play from {mainSource.label}</span></span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C17B4F] text-white">▶</span>
                </button>
              )}
            </div>
          )}
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-14">
              <div className="w-7 h-7 border-2 border-stone-200 border-t-stone-500 rounded-full animate-spin" />
              <p className="text-sm text-stone-400">Finding videos…</p>
            </div>
          )}

          {/* No API key */}
          {!loading && error === 'noKey' && !mainSource && allVideos.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" className="w-6 h-6">
                  <path d="M12 2L2 20h20L12 2z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="#D97706"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-stone-700">YouTube API key needed</p>
              <p className="text-xs text-stone-400 leading-relaxed">
                Add <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-600">YOUTUBE_API_KEY</code> to your Vercel environment variables to enable live video search.
              </p>
            </div>
          )}

          {/* Other error */}
          {!loading && error && error !== 'noKey' && !mainSource && allVideos.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-stone-400">Couldn&apos;t load videos. Try again later.</p>
            </div>
          )}

          {/* Empty results */}
          {!loading && !error && !mainSource && allVideos.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-stone-400">No videos found for this exercise.</p>
            </div>
          )}

          {/* Video list */}
          {!loading && allVideos.length > 0 && (
            <div className="divide-y divide-stone-50">
              {/* If playing, show remaining videos below the player */}
              {(playingId ? allVideos.filter(v => v.id !== playingId) : allVideos).map(video => (
                (() => {
                  const isFeatured = mainVideo?.id === video.id;
                  return (
                <button
                  key={video.id}
                  onClick={() => setPlayingId(video.id)}
                  className={`w-full flex gap-3 items-center px-4 py-3 hover:bg-stone-50 active:bg-stone-100 transition-colors text-left ${isFeatured ? 'bg-[#F8F1E6]' : ''}`}
                  style={{ touchAction: 'manipulation' }}
                >
                  {/* Thumbnail */}
                  <div
                    className={`relative flex-shrink-0 rounded-xl overflow-hidden bg-stone-100 ${isFeatured ? 'ring-2 ring-[#C17B4F]/30' : ''}`}
                    style={{ width: isFeatured ? 124 : 108, height: isFeatured ? 70 : 61 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnail}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {/* Play overlay */}
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.28)' }}
                    >
                      <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow">
                        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 ml-0.5" fill="#C17B4F">
                          <polygon points="5,3 17,10 5,17" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-stone-800 leading-snug line-clamp-2 ${isFeatured ? 'text-sm' : 'text-xs'}`}>{video.title}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p className="text-[11px] text-stone-400 truncate">{video.channel}</p>
                      {isFeatured && (
                        <span className="shrink-0 rounded-full bg-[#C17B4F] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                          Featured
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                  );
                })()
              ))}
            </div>
          )}

          {/* Tips section */}
          {exercise.tips.length > 0 && (
            <div className="px-4 py-4 border-t border-stone-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">
                How to do it
              </p>
              <ol className="space-y-2.5">
                {exercise.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                      style={{ background: '#7E9B86' }}
                    >{i + 1}</span>
                    <p className="text-sm text-stone-600 leading-snug">{tip}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
