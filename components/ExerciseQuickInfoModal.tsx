'use client';

import { useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { youtubeEmbedUrl, youtubeThumbnailUrl } from '@/lib/media';
import type { VideoResult } from '@/app/api/yt-search/route';

async function saveExercisePatch(exerciseId: string, patch: Partial<Exercise>) {
  const res = await fetch('/api/config?key=exerciseLibrary', { cache: 'no-store' });
  const data = await res.json();
  const library: Exercise[] = Array.isArray(data.value) ? data.value : [];
  const next = library.map(ex => ex.id === exerciseId ? { ...ex, ...patch } : ex);
  if (!next.some(ex => ex.id === exerciseId)) next.push({ ...patch, id: exerciseId } as Exercise);
  const post = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'exerciseLibrary', value: next }),
  });
  if (!post.ok) throw new Error('Could not save media');
}

const fileToImageDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read image'));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not load image'));
    img.onload = () => {
      const maxSide = 1400;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not prepare image'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = String(reader.result ?? '');
  };
  reader.readAsDataURL(file);
});

export default function ExerciseQuickInfoModal({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const embedUrl = youtubeEmbedUrl(exercise.mainVideoUrl);
  const imageUrl = exercise.mainImageUrl || exercise.gifUrl || youtubeThumbnailUrl(exercise.mainVideoUrl);
  const hasPrimaryImage = !!exercise.mainImageUrl;
  const hasPrimaryVideo = !!exercise.mainVideoUrl;
  const [uploading, setUploading] = useState(false);
  const [videoSearchOpen, setVideoSearchOpen] = useState(false);
  const [videoQuery, setVideoQuery] = useState(exercise.name);
  const [videoResults, setVideoResults] = useState<VideoResult[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [manualVideoUrl, setManualVideoUrl] = useState('');
  const [error, setError] = useState('');

  const uploadImage = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await fileToImageDataUrl(file);
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, name: file.name }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
      await saveExercisePatch(exercise.id, { mainImageUrl: data.url });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload image');
    } finally {
      setUploading(false);
    }
  };

  const searchVideos = async () => {
    const q = videoQuery.trim();
    if (!q) return;
    setVideoLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/yt-search?q=${encodeURIComponent(`${q} exercise physical therapy`)}`);
      const data = await res.json();
      if (data.noKey) throw new Error('YouTube search needs YOUTUBE_API_KEY. Paste a YouTube URL instead.');
      if (data.error) throw new Error(data.error);
      setVideoResults(data.videos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search YouTube');
    } finally {
      setVideoLoading(false);
    }
  };

  const saveVideo = async (url: string) => {
    setError('');
    try {
      await saveExercisePatch(exercise.id, { mainVideoUrl: url });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save video');
    }
  };

  const clearMedia = async (field: 'mainImageUrl' | 'mainVideoUrl') => {
    setError('');
    try {
      await saveExercisePatch(exercise.id, { [field]: undefined });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove media');
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div className="bg-[#F6F1E7] w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[88dvh] overflow-y-auto" onPointerDown={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-stone-200 flex justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-stone-800">{exercise.name}</h2>
            <p className="text-xs text-stone-500 mt-1">{exercise.cue}</p>
          </div>
          <button onPointerDown={onClose} className="w-9 h-9 rounded-full hover:bg-stone-200 text-xl text-stone-500">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

          {(imageUrl || embedUrl) && (
            <div className="overflow-hidden rounded-2xl bg-black shadow-sm">
              {embedUrl ? (
                <div className="relative aspect-video">
                  {hasPrimaryVideo && (
                    <button
                      onClick={() => clearMedia('mainVideoUrl')}
                      className="absolute right-2 top-2 z-10 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur"
                    >
                      Remove video
                    </button>
                  )}
                  <iframe
                    src={embedUrl}
                    title={`${exercise.name} main video`}
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full border-0"
                  />
                </div>
              ) : imageUrl ? (
                <div className="relative">
                  {hasPrimaryImage && (
                    <button
                      onClick={() => clearMedia('mainImageUrl')}
                      className="absolute right-2 top-2 z-10 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur"
                    >
                      Remove photo
                    </button>
                  )}
                  <img src={imageUrl} alt={`${exercise.name} main`} className="h-full w-full aspect-video object-cover bg-stone-100" />
                </div>
              ) : null}
            </div>
          )}

          {imageUrl && embedUrl && (
            <div className="relative">
              {hasPrimaryImage && (
                <button
                  onClick={() => clearMedia('mainImageUrl')}
                  className="absolute right-2 top-2 z-10 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur"
                >
                  Remove photo
                </button>
              )}
              <img src={imageUrl} alt={`${exercise.name} reference`} className="w-full rounded-2xl aspect-video object-cover bg-stone-100 border border-stone-100" />
            </div>
          )}

          {(!hasPrimaryImage || !hasPrimaryVideo) && (
            <div className="grid grid-cols-2 gap-2">
              {!hasPrimaryImage && (
                <label className="min-h-24 rounded-xl border-2 border-dashed border-stone-200 bg-white flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center active:bg-stone-50 cursor-pointer">
                  <span className="text-lg text-stone-300">＋</span>
                  <span className="text-xs font-bold text-stone-700">{uploading ? 'Uploading...' : 'Add photo'}</span>
                  <span className="text-[10px] text-stone-400 leading-tight">Photos or files</span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => { void uploadImage(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                </label>
              )}

              {!hasPrimaryVideo && (
                <button onClick={() => setVideoSearchOpen(prev => !prev)} className="min-h-24 rounded-xl border-2 border-dashed border-stone-200 bg-white flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center active:bg-stone-50">
                  <span className="text-lg text-stone-300">▶</span>
                  <span className="text-xs font-bold text-stone-700">Add video</span>
                  <span className="text-[10px] text-stone-400 leading-tight">Search or paste URL</span>
                </button>
              )}
            </div>
          )}

          {videoSearchOpen && !hasPrimaryVideo && (
            <div className="rounded-2xl border border-stone-100 bg-white p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Find main video</p>
              <div className="flex gap-2">
                <input value={videoQuery} onChange={e => setVideoQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchVideos()} className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm" style={{ fontSize: 16 }} />
                <button onClick={searchVideos} disabled={videoLoading || !videoQuery.trim()} className="rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-40" style={{ background: '#7E9B86' }}>{videoLoading ? '...' : 'Search'}</button>
              </div>
              <div className="flex gap-2">
                <input value={manualVideoUrl} onChange={e => setManualVideoUrl(e.target.value)} placeholder="Paste YouTube URL" className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm" style={{ fontSize: 16 }} />
                <button onClick={() => saveVideo(manualVideoUrl)} disabled={!manualVideoUrl.trim()} className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600 disabled:opacity-40">Save</button>
              </div>
              {videoResults.length > 0 && (
                <div className="max-h-72 overflow-y-auto divide-y divide-stone-50">
                  {videoResults.map(video => (
                    <button key={video.id} onClick={() => saveVideo(`https://www.youtube.com/watch?v=${video.id}`)} className="w-full flex gap-3 items-center py-2 text-left">
                      <img src={video.thumbnail} alt="" className="h-14 w-24 rounded-lg object-cover bg-stone-100" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-stone-700 line-clamp-2">{video.title}</span>
                        <span className="block text-[11px] text-stone-400 truncate">{video.channel}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {exercise.sets && <div className="bg-white rounded-xl border border-stone-100 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Sets</p><p className="text-sm font-semibold text-stone-800 mt-1">{exercise.sets}</p></div>}
          <div className="bg-white rounded-xl border border-stone-100 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">How to do it</p>
            <ul className="space-y-2">{exercise.tips.map((tip, i) => <li key={i} className="text-sm text-stone-700 leading-snug">• {tip}</li>)}</ul>
          </div>
          {!!exercise.videoTitles?.length && <div className="bg-white rounded-xl border border-stone-100 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Videos</p>{exercise.videoTitles.map((v, i) => <p key={i} className="text-xs text-stone-600">{i + 1}. {v}</p>)}</div>}
          <div className="bg-white rounded-xl border border-stone-100 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Image search</p><p className="text-xs text-stone-500 mt-1">{exercise.imageSearch}</p></div>
        </div>
      </div>
    </div>
  );
}
