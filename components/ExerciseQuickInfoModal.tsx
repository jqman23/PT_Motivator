'use client';

import { Exercise } from '@/lib/exercises';
import { youtubeEmbedUrl, youtubeThumbnailUrl } from '@/lib/media';

export default function ExerciseQuickInfoModal({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const embedUrl = youtubeEmbedUrl(exercise.mainVideoUrl);
  const imageUrl = exercise.mainImageUrl || exercise.gifUrl || youtubeThumbnailUrl(exercise.mainVideoUrl);

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
          {(imageUrl || embedUrl) && (
            <div className="overflow-hidden rounded-2xl bg-black shadow-sm">
              {embedUrl ? (
                <div className="relative aspect-video">
                  <iframe
                    src={embedUrl}
                    title={`${exercise.name} main video`}
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full border-0"
                  />
                </div>
              ) : imageUrl ? (
                <img src={imageUrl} alt={`${exercise.name} main`} className="h-full w-full aspect-video object-cover bg-stone-100" />
              ) : null}
            </div>
          )}

          {imageUrl && embedUrl && (
            <img src={imageUrl} alt={`${exercise.name} reference`} className="w-full rounded-2xl aspect-video object-cover bg-stone-100 border border-stone-100" />
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
