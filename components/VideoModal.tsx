'use client';

import { useEffect } from 'react';

interface Props {
  videoUrl: string;
  title: string;
  tips: string[];
  onClose: () => void;
}

function getYouTubeEmbedUrl(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/);
  if (match) {
    return `https://www.youtube.com/embed/${match[1]}?rel=0`;
  }
  return url;
}

export default function VideoModal({ videoUrl, title, tips, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-semibold text-stone-800 text-sm">{title}</h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="aspect-video bg-black">
          <iframe
            src={getYouTubeEmbedUrl(videoUrl)}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>

        {tips.length > 0 && (
          <div className="p-4">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
              Tips
            </p>
            <ul className="space-y-1.5">
              {tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-stone-700">
                  <span className="text-sage mt-0.5 flex-shrink-0">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
