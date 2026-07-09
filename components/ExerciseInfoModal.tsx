'use client';

import { Exercise } from '@/lib/exercises';
import { CategoryConfig, COLOR_PALETTE } from '@/lib/layout';
import { youtubeThumbnailUrl } from '@/lib/media';

interface Props {
  layout: CategoryConfig[];
  exerciseMap: Record<string, Exercise>;
  onClose: () => void;
}

function sourceLabel(ex: Exercise) {
  if (ex.sourceId === 'ai-added') return 'AI added';
  if (ex.origin === 'api_ninjas') return 'API Ninjas';
  if (ex.origin === 'exercisedb') return 'ExerciseDB';
  if (ex.origin === 'hep') return 'HEP';
  return 'Added';
}

export default function ExerciseInfoModal({ layout, exerciseMap, onClose }: Props) {
  const sections = layout.map(cat => ({
    cat,
    exercises: cat.exerciseIds.map(id => exerciseMap[id]).filter(Boolean),
  })).filter(section => section.exercises.length > 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '92dvh' }}
      >
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">Exercise guide</h2>
            <p className="text-[11px] text-stone-400">Consolidated cues, sets, tips, and demos</p>
          </div>
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="w-9 h-9 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          {sections.length === 0 && (
            <p className="text-sm text-stone-400 text-center py-8">No exercises in your current schedule yet.</p>
          )}

          {sections.map(({ cat, exercises }) => {
            const palette = COLOR_PALETTE[cat.color] ?? COLOR_PALETTE.green;
            return (
              <section key={cat.id}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: palette.accent }} />
                  <h3 className="font-serif text-sm font-semibold text-stone-800">{cat.name}</h3>
                  <span className="text-[10px] text-stone-400">{exercises.length}</span>
                </div>

                <div className="space-y-2">
                  {exercises.map(ex => (
                    <article key={ex.id} className="bg-white border border-stone-100 rounded-2xl p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        {(ex.mainImageUrls?.[0] || ex.mainImageUrl || ex.gifUrl || ex.mainVideoUrl) ? (
                          <img
                            src={ex.mainImageUrls?.[0] || ex.mainImageUrl || ex.gifUrl || youtubeThumbnailUrl(ex.mainVideoUrl)}
                            alt={`${ex.name} demo`}
                            className="w-16 h-16 rounded-xl object-cover bg-stone-50 flex-shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-stone-100 flex-shrink-0 flex items-center justify-center text-stone-300">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                              <circle cx="10" cy="5" r="2" />
                              <path d="M10 7v5M6.5 10h7M8.5 12l-2 5M11.5 12l2 5" />
                            </svg>
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <h4 className="text-sm font-bold text-stone-800 leading-snug flex-1">{ex.name}</h4>
                            {ex.origin && (
                              <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-stone-100 text-stone-400 flex-shrink-0">
                                {sourceLabel(ex)}
                              </span>
                            )}
                          </div>

                          {ex.sets && <p className="text-xs font-semibold text-stone-500 mt-1">{ex.sets}</p>}
                          {ex.cue && <p className="text-xs text-stone-500 mt-1 leading-snug">{ex.cue}</p>}
                        </div>
                      </div>

                      {ex.tips && ex.tips.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {ex.tips.slice(0, 4).map((tip, idx) => (
                            <li key={idx} className="text-[11px] text-stone-500 leading-snug flex gap-1.5">
                              <span className="text-stone-300">•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {ex.imageSearch && (
                        <p className="mt-2 text-[10px] text-stone-400 truncate">Media search: {ex.imageSearch}</p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
