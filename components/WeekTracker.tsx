'use client';

import { useState } from 'react';
import { Exercise } from '@/lib/exercises';

type LogMap = Record<string, Record<string, boolean>>;
type Category = 'mobility' | 'strength';

interface Props {
  log: LogMap;
  today: string;
  selectedDate: string;
  ptSessions?: { date: string; note?: string }[];
  exercises: Exercise[];
  onSelectDate: (date: string) => void;
}

function todayStr(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function lastNDays(n: number): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

function displayDay(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function WeekTracker({ log, today, selectedDate, ptSessions, exercises, onSelectDate }: Props) {
  const days = lastNDays(7);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  const categoryItems = {
    mobility: exercises.filter((e) => e.cat === 'mobility' && !e.optional),
    strength: exercises.filter((e) => e.cat === 'strength' && !e.optional),
  };

  function categoryCount(dateStr: string, cat: Category) {
    const items = categoryItems[cat];
    const dayLog = log[dateStr] || {};
    return items.filter((e) => dayLog[e.id]).length;
  }

  function categoryFraction(dateStr: string, cat: Category) {
    const items = categoryItems[cat];
    const done = categoryCount(dateStr, cat);
    return items.length ? done / items.length : 0;
  }

  const handleDayClick = (ds: string) => {
    const isTouchLike = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (isTouchLike) {
      setHoveredDay(ds);
      return;
    }
    onSelectDate(ds);
  };

  let mobComplete = 0, strComplete = 0;
  days.forEach((d) => {
    const ds = todayStr(d);
    if (categoryFraction(ds, 'mobility') >= 1) mobComplete++;
    if (categoryFraction(ds, 'strength') >= 1) strComplete++;
  });

  const hovered = hoveredDay
    ? {
        mobilityDone: categoryCount(hoveredDay, 'mobility'),
        mobilityTotal: categoryItems.mobility.length,
        strengthDone: categoryCount(hoveredDay, 'strength'),
        strengthTotal: categoryItems.strength.length,
        ptSession: ptSessions?.find((s) => s.date === hoveredDay),
      }
    : null;

  return (
    <div className="bg-white border border-stone-100 rounded-2xl p-4">
      <div className="mb-3">
        <h2 className="font-serif text-base font-semibold text-stone-800">This week</h2>
        <p className="text-[10px] text-stone-400 mt-0.5">
          {new Date(days[0].getTime()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {' – '}
          {new Date(days[days.length - 1].getTime()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {(['mobility', 'strength'] as const).map((cat) => (
        <div key={cat} className="flex items-center gap-3 mb-3 last:mb-0">
          <div className="w-20 flex-shrink-0">
            <p className="text-xs font-semibold text-stone-700 capitalize">{cat}</p>
            <p className="text-[10px] text-stone-400">{cat === 'mobility' ? 'goal: daily' : 'goal: 3×'}</p>
          </div>
          <div className="flex justify-between flex-1 gap-1">
            {days.map((d) => {
              const ds = todayStr(d);
              const frac = categoryFraction(ds, cat);
              const mobilityFrac = categoryFraction(ds, 'mobility');
              const strengthFrac = categoryFraction(ds, 'strength');
              const hasAnyDayData = mobilityFrac > 0 || strengthFrac > 0;
              const isToday = ds === today;
              const isSelected = ds === selectedDate;
              const hasPT = ptSessions?.some(s => s.date === ds);
              const showPTCircle = cat === 'mobility' && !!hasPT && !hasAnyDayData;
              const isHovered = hoveredDay === ds;

              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => handleDayClick(ds)}
                  onMouseEnter={() => setHoveredDay(ds)}
                  onMouseLeave={() => setHoveredDay(null)}
                  onFocus={() => setHoveredDay(ds)}
                  onBlur={() => setHoveredDay(null)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1 transition-colors outline-none ${
                    isHovered ? 'bg-stone-100' : 'hover:bg-stone-50 focus-visible:bg-stone-100'
                  }`}
                  title={`Show ${displayDay(ds)} summary`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 relative overflow-hidden transition-transform ${
                      showPTCircle
                        ? 'border-[#E7D4A3] bg-[#FCF8EE]'
                        : isSelected
                        ? 'border-[#D9A94B] ring-2 ring-[#D9A94B]/30'
                        : isToday
                        ? 'border-[#D9A94B]'
                        : 'border-stone-200'
                    } ${isHovered ? 'scale-110' : 'scale-100'}`}
                  >
                    {frac > 0 && (
                      <div
                        className="absolute bottom-0 left-0 right-0"
                        style={{
                          height: `${frac * 100}%`,
                          background: cat === 'strength' ? '#C17B4F' : '#7E9B86',
                        }}
                      />
                    )}
                  </div>
                  <span className={`text-[9px] font-medium ${isHovered ? 'text-stone-600' : 'text-stone-400'}`}>
                    {DAY_LABELS[d.getDay()]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="border-t border-stone-100 mt-3 pt-3 min-h-[58px]">
        {hoveredDay && hovered ? (
          <>
            <div className="flex items-center gap-2 mb-1.5 min-w-0">
              <p className="text-xs font-bold text-stone-700 flex-shrink-0">
                {displayDay(hoveredDay)}
              </p>
              {hovered.ptSession && (
                <>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: '#FBF5E8', color: '#D9A94B' }}
                  >
                    PT session
                  </span>
                  {hovered.ptSession.note?.trim() && (
                    <span className="text-[10px] text-stone-400 truncate">{hovered.ptSession.note}</span>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-xs text-stone-500">
                <span className="font-semibold text-[#7E9B86]">{hovered.mobilityDone}/{hovered.mobilityTotal}</span> mobility
              </span>
              <span className="text-xs text-stone-500">
                <span className="font-semibold text-[#C17B4F]">{hovered.strengthDone}/{hovered.strengthTotal}</span> strength
              </span>
              {!hovered.ptSession && hovered.mobilityDone === 0 && hovered.strengthDone === 0 && (
                <span className="text-xs text-stone-400 italic">No activity logged</span>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-[11px] text-stone-400 text-center">Tap or hover a day for a summary</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 flex-wrap gap-y-1">
        <p className="text-[10px] text-stone-400">
          Mobility: {mobComplete}/7 · Strength: {strComplete}/3
        </p>
        {ptSessions && ptSessions.some(s => days.some(day => todayStr(day) === s.date)) && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full border" style={{ background: '#FBF5E8', borderColor: '#D9A94B' }} />
            <span className="text-[10px] text-stone-400">PT session</span>
          </div>
        )}
      </div>
    </div>
  );
}
