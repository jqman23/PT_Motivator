'use client';

import { Exercise } from '@/lib/exercises';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

export default function VideoModal({ exercise, onClose }: Props) {
  // YouTube embedded search — shows a playlist of relevant search results.
  // No specific video IDs needed; no embedding-disabled errors.
  const q = encodeURIComponent(`${exercise.name} exercise physical therapy how to`);
  const embedUrl = `https://www.youtube.com/embed?listType=search&list=${q}&rel=0&modestbranding=1&playsinline=1`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#a8a29e' }}>
              Video Guide
            </p>
            <p className="text-sm font-semibold leading-tight" style={{ color: '#1c1917' }}>
              {exercise.name}
            </p>
          </div>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
            className="text-stone-400 text-2xl leading-none w-8 h-8 flex items-center justify-center flex-shrink-0"
            style={{ touchAction: 'manipulation' }}
          >×</button>
        </div>

        {/* YouTube search embed */}
        <div className="aspect-video bg-black">
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{ border: 'none', display: 'block' }}
            title={`${exercise.name} video guide`}
          />
        </div>

        {/* Tips */}
        {exercise.tips.length > 0 && (
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: '#a8a29e' }}>
              How to do it
            </p>
            <ol className="space-y-2.5">
              {exercise.tips.map((tip, i) => (
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
