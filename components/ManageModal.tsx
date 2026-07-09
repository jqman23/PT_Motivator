'use client';

import { useEffect, useRef, useState } from 'react';
import { Exercise } from '@/lib/exercises';
import { CategoryConfig, COLOR_PALETTE, COLOR_KEYS } from '@/lib/layout';
import { normalizeExerciseType } from '@/lib/exerciseTypes';

interface Props {
  layout: CategoryConfig[];
  exerciseMap: Record<string, Exercise>;
  onChange: (next: CategoryConfig[]) => void;
  onRequestAddExercise: (catId: string) => void;
  onDeleteExercise: (exId: string) => void;
  onClose: () => void;
}

type Drag = { type: 'cat' | 'ex'; id: string } | null;
type DropTarget = { catId?: string; index: number } | null;

// Drag-handle glyph: three stacked lines (not the 6-dot grid).
function DragHandle() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4">
      <path d="M3 5h10M3 8h10M3 11h10" />
    </svg>
  );
}

export default function ManageModal({ layout, exerciseMap, onChange, onRequestAddExercise, onDeleteExercise, onClose }: Props) {
  const [drag, setDrag] = useState<Drag>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<string | null>(null);
  const [confirmDeleteEx, setConfirmDeleteEx] = useState<string | null>(null);

  const catSectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const exRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const commitDrop = (current: NonNullable<Drag>) => {
    if (!dropTarget) { setDropTarget(null); return; }

    if (current.type === 'cat') {
      const from = layout.findIndex(c => c.id === current.id);
      if (from < 0) { setDropTarget(null); return; }
      let to = dropTarget.index;
      const next = [...layout];
      const [moved] = next.splice(from, 1);
      if (from < to) to--;
      next.splice(to, 0, moved);
      onChange(next);
    } else {
      const fromCat = layout.find(c => c.exerciseIds.includes(current.id));
      if (!fromCat) { setDropTarget(null); return; }
      const fromIndex = fromCat.exerciseIds.indexOf(current.id);
      const toCatId = dropTarget.catId!;
      let toIndex = dropTarget.index;
      if (fromCat.id === toCatId && fromIndex < toIndex) toIndex--;

      const next = layout.map(c => ({ ...c, exerciseIds: c.exerciseIds.filter(id => id !== current.id) }))
        .map(c => {
          if (c.id !== toCatId) return c;
          const ids = [...c.exerciseIds];
          ids.splice(Math.min(toIndex, ids.length), 0, current.id);
          return { ...c, exerciseIds: ids };
        });
      onChange(next);
    }
    setDropTarget(null);
  };

  // ── Pointer-driven drag (works for both mouse and touch) ────────────────────
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const y = e.clientY;

      if (drag.type === 'cat') {
        let index = layout.length;
        for (let i = 0; i < layout.length; i++) {
          const el = catSectionRefs.current.get(layout[i].id);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (y < r.top + r.height / 2) { index = i; break; }
        }
        setDropTarget({ index });
        return;
      }

      // Exercise drag — find the category under the pointer, then the slot.
      let targetCatId = layout[layout.length - 1]?.id;
      for (const c of layout) {
        const el = catSectionRefs.current.get(c.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.bottom) { targetCatId = c.id; break; }
      }
      const cat = layout.find(c => c.id === targetCatId);
      let index = cat ? cat.exerciseIds.length : 0;
      if (cat) {
        for (let i = 0; i < cat.exerciseIds.length; i++) {
          const el = exRowRefs.current.get(cat.exerciseIds[i]);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (y < r.top + r.height / 2) { index = i; break; }
        }
      }
      setDropTarget({ catId: targetCatId, index });
    };

    const onUp = () => {
      setDrag(current => {
        if (current) commitDrop(current);
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, layout, dropTarget]);

  const startDrag = (type: 'cat' | 'ex', id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ type, id });
    setConfirmDeleteCat(null);
    setConfirmDeleteEx(null);
  };

  // ── Edits ───────────────────────────────────────────────────────────────────
  const renameCat = (catId: string, name: string) =>
    onChange(layout.map(c => c.id === catId ? { ...c, name: name.trim() || c.name } : c));
  const recolorCat = (catId: string, color: string) =>
    onChange(layout.map(c => c.id === catId ? { ...c, color } : c));
  const deleteCat = (catId: string) => {
    onChange(layout.filter(c => c.id !== catId));
    setConfirmDeleteCat(null);
  };
  const removeEx = (catId: string, exId: string) =>
    onChange(layout.map(c => c.id === catId ? { ...c, exerciseIds: c.exerciseIds.filter(id => id !== exId) } : c));

  const sortCatByType = (catId: string) => {
    const next = layout.map(c => {
      if (c.id !== catId) return c;
      const sorted = [...c.exerciseIds].sort((a, b) => {
        const exA = exerciseMap[a];
        const exB = exerciseMap[b];
        const typeA = normalizeExerciseType(exA?.cat);
        const typeB = normalizeExerciseType(exB?.cat);
        const typeCmp = typeA.localeCompare(typeB);
        if (typeCmp !== 0) return typeCmp;
        return (exA?.name ?? '').localeCompare(exB?.name ?? '');
      });
      return { ...c, exerciseIds: sorted };
    });
    onChange(next);
  };

  const permanentlyDeleteEx = (exId: string) => {
    onDeleteExercise(exId);
    setConfirmDeleteEx(null);
  };

  const insertLine = (color: string) => (
    <div className="h-0.5 rounded-full my-0.5" style={{ background: color }} />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4 sm:py-8"
      onClick={onClose}
    >
      <div
        className="bg-[#F6F1E7] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '92dvh' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">Reorder &amp; edit</h2>
            <p className="text-[11px] text-stone-400">Drag the <span className="font-semibold">≡</span> handle to move things</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-3 py-3" style={{ touchAction: drag ? 'none' : 'pan-y' }}>
          {layout.map((cat, catIdx) => {
            const palette = COLOR_PALETTE[cat.color] ?? COLOR_PALETTE.green;
            const catDragging = drag?.type === 'cat' && drag.id === cat.id;
            const showCatLineBefore = drag?.type === 'cat' && dropTarget?.index === catIdx;

            return (
              <div key={cat.id}>
                {showCatLineBefore && insertLine(palette.accent)}
                <div
                  ref={el => { if (el) catSectionRefs.current.set(cat.id, el); else catSectionRefs.current.delete(cat.id); }}
                  className="mb-3 rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden"
                  style={{ opacity: catDragging ? 0.4 : 1 }}
                >
                  {/* Category header */}
                  <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ background: palette.light + '80' }}>
                    <span
                      onPointerDown={e => startDrag('cat', cat.id, e)}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-stone-400 cursor-grab active:cursor-grabbing rounded-lg hover:bg-white/60"
                      style={{ touchAction: 'none' }}
                      title="Drag to reorder category"
                    >
                      <DragHandle />
                    </span>
                    <input
                      key={cat.id}
                      defaultValue={cat.name}
                      onBlur={e => renameCat(cat.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="flex-1 min-w-0 text-sm font-semibold text-stone-800 bg-transparent border border-transparent focus:border-stone-300 focus:bg-white rounded-lg px-2 py-1 focus:outline-none"
                      style={{ fontSize: 16 }}
                    />
                    {confirmDeleteCat === cat.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => deleteCat(cat.id)} className="text-[11px] font-bold px-2 py-1 rounded-lg text-white bg-red-500">Delete</button>
                        <button onClick={() => setConfirmDeleteCat(null)} className="text-[11px] font-semibold px-2 py-1 rounded-lg text-stone-500 bg-stone-100">No</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteCat(cat.id)}
                        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-stone-400 hover:bg-red-50 hover:text-red-500"
                        title="Delete category"
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5h7L12 4" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Colors */}
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-stone-100">
                    {COLOR_KEYS.map(c => (
                      <button key={c} onClick={() => recolorCat(cat.id, c)}
                        className="w-5 h-5 rounded-full"
                        style={{
                          background: COLOR_PALETTE[c].accent,
                          boxShadow: cat.color === c ? `0 0 0 2px white, 0 0 0 3.5px ${COLOR_PALETTE[c].accent}` : 'none',
                        }} />
                    ))}
                    <button
                      onClick={() => sortCatByType(cat.id)}
                      className="ml-auto rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-stone-500"
                      style={{ touchAction: 'manipulation' }}
                      title="Sort exercises in this category by type"
                    >
                      Sort by type
                    </button>
                  </div>

                  {/* Exercises */}
                  <div className="px-2 py-2">
                    {cat.exerciseIds.length === 0 && !(drag?.type === 'ex' && dropTarget?.catId === cat.id) && (
                      <p className="text-[11px] text-stone-300 italic px-2 py-1.5">No exercises — drag one here or add below</p>
                    )}
                    {cat.exerciseIds.map((exId, exIdx) => {
                      const ex = exerciseMap[exId];
                      const exDragging = drag?.type === 'ex' && drag.id === exId;
                      const showLineBefore = drag?.type === 'ex' && dropTarget?.catId === cat.id && dropTarget?.index === exIdx;
                      return (
                        <div key={exId}>
                          {showLineBefore && insertLine(palette.accent)}
                          <div
                            ref={el => { if (el) exRowRefs.current.set(exId, el); else exRowRefs.current.delete(exId); }}
                            className="flex items-center gap-1.5 rounded-xl bg-stone-50 px-1.5 py-1.5"
                            style={{ opacity: exDragging ? 0.4 : 1 }}
                          >
                            <span
                              onPointerDown={e => startDrag('ex', exId, e)}
                              className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-stone-300 cursor-grab active:cursor-grabbing rounded-lg hover:bg-stone-200"
                              style={{ touchAction: 'none' }}
                              title="Drag to move exercise"
                            >
                              <DragHandle />
                            </span>
                            <span className="flex-1 min-w-0 text-sm text-stone-700 truncate">
                              {ex ? ex.name : <span className="italic text-stone-400">Unknown exercise</span>}
                            </span>
                            {confirmDeleteEx === exId ? (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => permanentlyDeleteEx(exId)}
                                  className="text-[11px] font-bold px-2 py-1 rounded-lg text-white bg-red-500"
                                  title="Permanently delete from library"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteEx(null)}
                                  className="text-[11px] font-semibold px-2 py-1 rounded-lg text-stone-500 bg-stone-100"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => removeEx(cat.id, exId)}
                                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-stone-300 hover:bg-stone-100 hover:text-stone-500"
                                  title="Remove from this category only"
                                >
                                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-3.5 h-3.5">
                                    <path d="M4 4l8 8M12 4l-8 8" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteEx(exId)}
                                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-stone-300 hover:bg-red-50 hover:text-red-500"
                                  title="Permanently delete from exercise library"
                                >
                                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5h7L12 4" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {drag?.type === 'ex' && dropTarget?.catId === cat.id && dropTarget?.index === cat.exerciseIds.length && insertLine(palette.accent)}

                    <button
                      onClick={() => onRequestAddExercise(cat.id)}
                      className="mt-1 text-xs font-semibold flex items-center gap-1 px-2 py-1.5 rounded-lg text-stone-400 hover:bg-stone-100"
                    >
                      <span className="text-base leading-none">＋</span> Add exercise
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {drag?.type === 'cat' && dropTarget?.index === layout.length && insertLine(COLOR_PALETTE.green.accent)}
        </div>

        <div className="px-4 py-3 border-t border-stone-200 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 text-sm font-semibold text-white rounded-xl" style={{ background: '#7E9B86' }}>Done</button>
        </div>
      </div>
    </div>
  );
}
