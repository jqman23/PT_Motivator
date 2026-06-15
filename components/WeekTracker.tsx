'use client';

import { EXERCISES } from '@/lib/exercises';

type LogMap = Record<string, Record<string, boolean>>;

interface Props {
  log: LogMap;
  today: string;
  selectedDate: string;
  ptSessions?: { date: string; note?: string }[];
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

export default function WeekTracker({ log, today, selectedDate, ptSessions }: Props) {
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

              return (
                <div key={ds} className="flex flex-col items-center gap-0.5">
                  <div
                    className={`w-5 h-5 rounded-full border-2 relative overflow-hidden ${
                      showPTCircle
                        ? 'border-[#E7D4A3] bg-[#FCF8EE]'
                        : isSelected
                        ? 'border-[#D9A94B] ring-2 ring-[#D9A94B]/30'
                        : isToday
                        ? 'border-[#D9A94B]'
                        : 'border-stone-200'
                    }`}
                    title={showPTCircle ? 'PT session' : undefined}
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
