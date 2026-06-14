'use client';

import { EXERCISES } from '@/lib/exercises';

type LogMap = Record<string, Record<string, boolean>>;

interface Props {
  log: LogMap;
  today: string;
  selectedDate: string;
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

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function WeekTracker({ log, today, selectedDate }: Props) {
  const days = lastNDays(7);

  function categoryFraction(dateStr: string, cat: 'mobility' | 'strength') {
    const items = EXERCISES.filter((e) => e.cat === cat && !e.optional);
    const dayLog = log[dateStr] || {};
    const done = items.filter((e) => dayLog[e.id]).length;
    return items.length ? done / items.length : 0;
  }

  let mobComplete = 0, strComplete = 0;
  days.forEach((d) => {
    const ds = todayStr(d);
    if (categoryFraction(ds, 'mobility') >= 1) mobComplete++;
    if (categoryFraction(ds, 'strength') >= 1) strComplete++;
  });

  return (
    <div className="bg-white border border-stone-100 rounded-2xl p-4">
      <h2 className="font-serif text-base font-semibold text-stone-800 mb-3">This week</h2>

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
              const isToday = ds === today;
              const isSelected = ds === selectedDate;
              return (
                <div key={ds} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-5 h-5 rounded-full border-2 relative overflow-hidden ${
                      isSelected
                        ? 'border-[#D9A94B] ring-2 ring-[#D9A94B]/30'
                        : isToday
                        ? 'border-[#D9A94B]'
                        : 'border-stone-200'
                    }`}
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
                  <span className="text-[9px] text-stone-400 font-medium">
                    {DAY_LABELS[d.getDay()]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-xs text-stone-400 text-center mt-2">
        Mobility: {mobComplete}/7 days · Strength: {strComplete}/3 this week
      </p>
    </div>
  );
}
