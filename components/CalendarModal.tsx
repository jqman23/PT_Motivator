'use client';

import { useState, useEffect } from 'react';
import { EXERCISES } from '@/lib/exercises';

type LogMap = Record<string, Record<string, boolean>>;
type HealthMap = Record<string, { sleep_hours?: number; sleep_quality?: number; energy?: number; mood?: number; pain?: number }>;
type PTSession = { date: string; note?: string };

interface DaySummary {
  mobilityFrac: number;
  strengthFrac: number;
  hasHealth: boolean;
  health: HealthMap[string];
  noteCount: number;
}

interface Props {
  onSelectDate: (date: string) => void;
  onClose: () => void;
  today: string;
  selectedDate: string;
  ptSessions?: PTSession[];
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }

export default function CalendarModal({ onSelectDate, onClose, today, selectedDate, ptSessions }: Props) {
  const [viewYear, setViewYear] = useState(() => parseInt(selectedDate.split('-')[0]));
  const [viewMonth, setViewMonth] = useState(() => parseInt(selectedDate.split('-')[1]));
  const [log, setLog] = useState<LogMap>({});
  const [health, setHealth] = useState<HealthMap>({});
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const start = ymd(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    const end = ymd(viewYear, viewMonth, lastDay);
    setLoading(true);
    Promise.all([
      fetch(`/api/log?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({ rows: [] })),
      fetch(`/api/health?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({ rows: [] })),
    ]).then(([logData, healthData]) => {
      const newLog: LogMap = {};
      for (const row of (logData.rows ?? [])) {
        const dk = (row.date as string).split('T')[0];
        if (!newLog[dk]) newLog[dk] = {};
        newLog[dk][row.exercise_id] = row.completed;
      }
      setLog(newLog);
      const newHealth: HealthMap = {};
      for (const row of (healthData.rows ?? [])) {
        const dk = (row.date as string).split('T')[0];
        newHealth[dk] = row;
      }
      setHealth(newHealth);
    }).finally(() => setLoading(false));
  }, [viewYear, viewMonth]);

  const mobilityItems = EXERCISES.filter(e => e.cat === 'mobility' && !e.optional);
  const strengthItems = EXERCISES.filter(e => e.cat === 'strength' && !e.optional);

  function getDaySummary(ds: string): DaySummary {
    const dayLog = log[ds] || {};
    const mobDone = mobilityItems.filter(e => dayLog[e.id]).length;
    const strDone = strengthItems.filter(e => dayLog[e.id]).length;
    const h = health[ds];
    return {
      mobilityFrac: mobilityItems.length ? mobDone / mobilityItems.length : 0,
      strengthFrac: strengthItems.length ? strDone / strengthItems.length : 0,
      hasHealth: !!h && Object.values(h).some(v => v != null),
      health: h ?? {},
      noteCount: 0,
    };
  }

  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    const [ty, tm] = today.split('-').map(Number);
    if (viewYear === ty && viewMonth === tm) return;
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const [ty, tm] = today.split('-').map(Number);
  const canGoNext = !(viewYear === ty && viewMonth === tm);

  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const hovered = hoveredDay ? getDaySummary(hoveredDay) : null;
  const hoveredPTSession = hoveredDay ? ptSessions?.find(s => s.date === hoveredDay) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <button onClick={prevMonth} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-500 font-bold">‹</button>
          <div className="text-center">
            <p className="text-sm font-bold text-stone-800">{monthLabel}</p>
            {loading && <p className="text-[10px] text-stone-400">Loading…</p>}
          </div>
          <button onClick={nextMonth} disabled={!canGoNext} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-500 font-bold disabled:opacity-30">›</button>
        </div>

        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-stone-50 border-b border-stone-100 flex-wrap">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#7E9B86]"/><span className="text-[10px] text-stone-500 font-medium">Mobility</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#C17B4F]"/><span className="text-[10px] text-stone-500 font-medium">Strength</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#5B9BD5]"/><span className="text-[10px] text-stone-500 font-medium">Health log</span></div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#D9A94B' }}/>
            <span className="text-[10px] text-stone-500 font-medium">PT session</span>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-stone-100">
          {DOW.map(d => (
            <div key={d} className="text-center py-2 text-[10px] font-bold text-stone-400 uppercase tracking-wider">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 p-2 gap-1 relative">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;
            const ds = ymd(viewYear, viewMonth, day);
            const isFuture = ds > today;
            const isToday = ds === today;
            const isSelected = ds === selectedDate;
            const summary = getDaySummary(ds);
            const hasAnyData = summary.mobilityFrac > 0 || summary.strengthFrac > 0 || summary.hasHealth;
            const ptSession = ptSessions?.find(s => s.date === ds);
            const isPTSession = !!ptSession;
            const showPTDot = isPTSession && !hasAnyData;

            return (
              <div
                key={ds}
                onMouseEnter={() => setHoveredDay(ds)}
                onMouseLeave={() => setHoveredDay(null)}
                onClick={() => { if (!isFuture) { onSelectDate(ds); onClose(); } }}
                className={`relative flex flex-col items-center py-1 rounded-xl transition-colors ${
                  isFuture ? 'opacity-30 cursor-default' :
                  isSelected ? 'bg-[#D9A94B]/20 cursor-pointer' :
                  isPTSession ? 'bg-amber-50 cursor-pointer hover:bg-amber-100' :
                  'cursor-pointer hover:bg-stone-100'
                }`}
              >
                <span className={`text-xs font-semibold mb-1 ${
                  isToday ? 'text-[#D9A94B] font-bold' :
                  isSelected ? 'text-stone-800 font-bold' :
                  'text-stone-700'
                }`}>{day}</span>

                <div className="flex gap-0.5 justify-center min-h-[10px]">
                  {summary.mobilityFrac > 0 && (
                    <div className="w-2 h-2 rounded-full relative overflow-hidden bg-stone-200 flex-shrink-0">
                      <div className="absolute bottom-0 left-0 right-0 bg-[#7E9B86]" style={{ height: `${summary.mobilityFrac * 100}%` }} />
                    </div>
                  )}
                  {summary.strengthFrac > 0 && (
                    <div className="w-2 h-2 rounded-full relative overflow-hidden bg-stone-200 flex-shrink-0">
                      <div className="absolute bottom-0 left-0 right-0 bg-[#C17B4F]" style={{ height: `${summary.strengthFrac * 100}%` }} />
                    </div>
                  )}
                  {summary.hasHealth && (
                    <div className="w-2 h-2 rounded-full bg-[#5B9BD5] flex-shrink-0" />
                  )}
                  {showPTDot && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#D9A94B' }} />
                  )}
                  {!hasAnyData && !showPTDot && !isFuture && <div className="w-2 h-2" />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-stone-100 px-4 py-3 bg-stone-50 h-[84px] overflow-hidden">
          {hoveredDay && hovered ? (
            <>
              <div className="flex items-center gap-2 mb-1.5 min-w-0">
                <p className="text-xs font-bold text-stone-700 flex-shrink-0">
                  {new Date(hoveredDay + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
                {hoveredPTSession && (
                  <>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: '#FBF5E8', color: '#D9A94B' }}>PT session</span>
                    {hoveredPTSession.note?.trim() && (
                      <span className="text-[10px] text-stone-400 truncate">{hoveredPTSession.note}</span>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-xs text-stone-500">
                  <span className="font-semibold text-[#7E9B86]">{Math.round(hovered.mobilityFrac * mobilityItems.length)}/{mobilityItems.length}</span> mobility
                </span>
                <span className="text-xs text-stone-500">
                  <span className="font-semibold text-[#C17B4F]">{Math.round(hovered.strengthFrac * strengthItems.length)}/{strengthItems.length}</span> strength
                </span>
                {hovered.hasHealth && <>
                  {hovered.health.pain != null && <span className="text-xs text-stone-500">Pain: <span className="font-semibold">{hovered.health.pain}/10</span></span>}
                  {hovered.health.energy != null && <span className="text-xs text-stone-500">Energy: <span className="font-semibold">{hovered.health.energy}/10</span></span>}
                  {hovered.health.mood != null && <span className="text-xs text-stone-500">Mood: <span className="font-semibold">{hovered.health.mood}/10</span></span>}
                  {hovered.health.sleep_hours != null && <span className="text-xs text-stone-500">Sleep: <span className="font-semibold">{hovered.health.sleep_hours}h</span></span>}
                </>}
                {!hoveredPTSession && !hovered.hasHealth && hovered.mobilityFrac === 0 && hovered.strengthFrac === 0 && (
                  <span className="text-xs text-stone-400 italic">No activity logged</span>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-[11px] text-stone-400 text-center">Hover a day for a summary · tap to view &amp; edit it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
