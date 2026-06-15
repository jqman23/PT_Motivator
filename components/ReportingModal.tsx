'use client';

import { useState, useEffect, useMemo } from 'react';
import { EXERCISES } from '@/lib/exercises';

interface Props {
  onClose: () => void;
  today: string;
  ptSessions: { date: string; note?: string }[];
}

type HealthRow = { date: string; pain?: number; energy?: number; mood?: number; sleep_hours?: number; treatment_notes?: string };
type LogRow = { date: string; exercise_id: string; completed: boolean };
type Range = '1W' | '2W' | '1M' | '3M';
type ReportTab = 'overview' | 'pt';

function pad(n: number) { return String(n).padStart(2, '0'); }
function offsetDate(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) { out.push(cur); cur = offsetDate(cur, 1); }
  return out;
}

function LineChart({ data, color, max = 10 }: {
  data: Array<{ date: string; value: number }>;
  color: string;
  max?: number;
}) {
  if (!data.length) return (
    <div className="h-16 flex items-center justify-center">
      <p className="text-[11px] text-stone-400 italic">No data logged for this period</p>
    </div>
  );
  const W = 280, H = 72, ml = 22, mr = 8, mt = 8, mb = 20;
  const cw = W - ml - mr, ch = H - mt - mb;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  const px = (i: number) => ml + (n <= 1 ? cw / 2 : (i / (n - 1)) * cw);
  const py = (v: number) => mt + ch - (v / max) * ch;
  const pts = sorted.map((d, i) => `${px(i)},${py(d.value)}`).join(' ');
  const area = `${px(0)},${mt + ch} ${pts} ${px(n - 1)},${mt + ch}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      {[0, 5, 10].map(v => (
        <g key={v}>
          <line x1={ml} y1={py(v)} x2={W - mr} y2={py(v)} stroke="#e7e5e4" strokeWidth="1" />
          <text x={ml - 4} y={py(v) + 3.5} textAnchor="end" fontSize="8" fill="#a8a29e">{v}</text>
        </g>
      ))}
      <polygon points={area} fill={color} fillOpacity="0.13" />
      {n > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
      {sorted.map((d, i) => (
        <circle key={i} cx={px(i)} cy={py(d.value)} r="3" fill={color} stroke="white" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function MultiLineChart({ series, max = 10 }: {
  series: Array<{ data: Array<{ date: string; value: number }>; color: string }>;
  max?: number;
}) {
  const allData = series.flatMap(s => s.data);
  if (!allData.length) return (
    <div className="h-16 flex items-center justify-center">
      <p className="text-[11px] text-stone-400 italic">No wellbeing data logged for this period</p>
    </div>
  );
  const W = 280, H = 72, ml = 22, mr = 8, mt = 8, mb = 20;
  const cw = W - ml - mr, ch = H - mt - mb;
  const allDates = [...new Set(allData.map(d => d.date))].sort();
  const n = allDates.length;
  const dateIdx = Object.fromEntries(allDates.map((d, i) => [d, i]));
  const px = (i: number) => ml + (n <= 1 ? cw / 2 : (i / (n - 1)) * cw);
  const py = (v: number) => mt + ch - (v / max) * ch;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      {[0, 5, 10].map(v => (
        <g key={v}>
          <line x1={ml} y1={py(v)} x2={W - mr} y2={py(v)} stroke="#e7e5e4" strokeWidth="1" />
          <text x={ml - 4} y={py(v) + 3.5} textAnchor="end" fontSize="8" fill="#a8a29e">{v}</text>
        </g>
      ))}
      {series.map((s, si) => {
        const sorted = [...s.data].sort((a, b) => a.date.localeCompare(b.date));
        if (!sorted.length) return null;
        const pts = sorted.map(d => `${px(dateIdx[d.date])},${py(d.value)}`).join(' ');
        return (
          <g key={si}>
            {sorted.length > 1 && <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />}
            {sorted.map((d, i) => (
              <circle key={i} cx={px(dateIdx[d.date])} cy={py(d.value)} r="2.5" fill={s.color} stroke="white" strokeWidth="1.2" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function WeeklyBarChart({ weeks }: {
  weeks: Array<{ label: string; mobility: number; strength: number }>;
}) {
  if (!weeks.length) return (
    <div className="h-24 flex items-center justify-center">
      <p className="text-[11px] text-stone-400 italic">No completion data yet</p>
    </div>
  );
  const W = 280, H = 88, ml = 28, mr = 8, mt = 8, mb = 24;
  const cw = W - ml - mr, ch = H - mt - mb;
  const colW = cw / weeks.length;
  const bw = Math.max(4, Math.min(14, colW * 0.3));
  const gap = 2;
  const py = (v: number) => mt + ch - (v / 100) * ch;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 50, 100].map(v => (
        <g key={v}>
          <line x1={ml} y1={py(v)} x2={W - mr} y2={py(v)} stroke="#e7e5e4" strokeWidth="1" />
          <text x={ml - 4} y={py(v) + 3.5} textAnchor="end" fontSize="8" fill="#a8a29e">{v}</text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const cx = ml + i * colW + colW / 2;
        const mobH = (w.mobility / 100) * ch;
        const strH = (w.strength / 100) * ch;
        return (
          <g key={i}>
            <rect x={cx - bw - gap} y={py(w.mobility)} width={bw} height={mobH} fill="#7E9B86" rx="2" />
            <rect x={cx + gap} y={py(w.strength)} width={bw} height={strH} fill="#C17B4F" rx="2" />
            <text x={cx} y={H - 6} textAnchor="middle" fontSize="8" fill="#a8a29e">{w.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ReportingModal({ onClose, today, ptSessions }: Props) {
  const [range, setRange] = useState<Range>('1M');
  const [tab, setTab] = useState<ReportTab>('overview');
  const [healthData, setHealthData] = useState<HealthRow[]>([]);
  const [logData, setLogData] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const startDate = useMemo(() => {
    const days = range === '1W' ? 7 : range === '2W' ? 14 : range === '1M' ? 30 : 90;
    return offsetDate(today, -(days - 1));
  }, [today, range]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/health?start=${startDate}&end=${today}`).then(r => r.json()).catch(() => ({ rows: [] })),
      fetch(`/api/log?start=${startDate}&end=${today}`).then(r => r.json()).catch(() => ({ rows: [] })),
    ]).then(([h, l]) => {
      setHealthData((h.rows ?? []).map((r: Record<string, unknown>) => ({ ...r, date: (r.date as string).split('T')[0] })));
      setLogData((l.rows ?? []).map((r: Record<string, unknown>) => ({ ...r, date: (r.date as string).split('T')[0] })));
    }).finally(() => setLoading(false));
  }, [startDate, today]);

  const painData = useMemo(() =>
    healthData.filter(h => h.pain != null).map(h => ({ date: h.date, value: Number(h.pain) })).sort((a, b) => a.date.localeCompare(b.date)),
    [healthData]);

  const energyData = useMemo(() =>
    healthData.filter(h => h.energy != null).map(h => ({ date: h.date, value: Number(h.energy) })).sort((a, b) => a.date.localeCompare(b.date)),
    [healthData]);

  const moodData = useMemo(() =>
    healthData.filter(h => h.mood != null).map(h => ({ date: h.date, value: Number(h.mood) })).sort((a, b) => a.date.localeCompare(b.date)),
    [healthData]);

  const weeklyData = useMemo(() => {
    const logMap: Record<string, Record<string, boolean>> = {};
    for (const row of logData) {
      if (!logMap[row.date]) logMap[row.date] = {};
      logMap[row.date][row.exercise_id] = row.completed;
    }
    const mobItems = EXERCISES.filter(e => e.cat === 'mobility' && !e.optional);
    const strItems = EXERCISES.filter(e => e.cat === 'strength' && !e.optional);
    const allDates = datesInRange(startDate, today);
    const weeks: Array<{ label: string; mobility: number; strength: number }> = [];
    for (let i = 0; i < allDates.length; i += 7) {
      const wDates = allDates.slice(i, i + 7);
      let mD = 0, mT = 0, sD = 0, sT = 0;
      for (const d of wDates) {
        const dl = logMap[d] || {};
        mobItems.forEach(e => { mT++; if (dl[e.id]) mD++; });
        strItems.forEach(e => { sT++; if (dl[e.id]) sD++; });
      }
      const label = new Date(wDates[0] + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      weeks.push({ label, mobility: mT ? Math.round((mD / mT) * 100) : 0, strength: sT ? Math.round((sD / sT) * 100) : 0 });
    }
    return weeks;
  }, [logData, startDate, today]);

  const stats = useMemo(() => {
    const logMap: Record<string, Record<string, boolean>> = {};
    for (const row of logData) {
      if (!logMap[row.date]) logMap[row.date] = {};
      logMap[row.date][row.exercise_id] = row.completed;
    }
    const allDates = datesInRange(startDate, today);
    let streak = 0;
    let streakBroken = false;
    let daysActive = 0;
    for (let i = allDates.length - 1; i >= 0; i--) {
      const dl = logMap[allDates[i]] || {};
      const hasAny = Object.values(dl).some(Boolean);
      if (hasAny) {
        daysActive++;
        if (!streakBroken) streak++;
      } else if (!streakBroken && allDates[i] < today) {
        streakBroken = true;
      }
    }
    const nonOpt = EXERCISES.filter(e => !e.optional);
    const totalDone = allDates.reduce((s, d) => s + nonOpt.filter(e => logMap[d]?.[e.id]).length, 0);
    const totalPossible = allDates.length * nonOpt.length;
    const overallRate = totalPossible ? Math.round((totalDone / totalPossible) * 100) : 0;
    const ptInRange = ptSessions.filter(s => s.date >= startDate && s.date <= today).length;
    const avgPain = painData.length
      ? (painData.reduce((s, d) => s + d.value, 0) / painData.length).toFixed(1)
      : null;
    return { streak, daysActive, overallRate, ptInRange, avgPain };
  }, [logData, startDate, today, ptSessions, painData]);

  const ptImpact = useMemo(() => {
    const byDate = Object.fromEntries(healthData.map(h => [h.date, h]));
    const ptDates = ptSessions.filter(s => s.date >= startDate && s.date <= today).map(s => s.date);
    const allDates = datesInRange(startDate, today);
    const nonPtDates = allDates.filter(d => !ptDates.includes(d));
    const avg = (dates: string[], field: 'pain' | 'energy' | 'mood') => {
      const vals = dates.map(d => byDate[d]?.[field]).filter((v): v is number => typeof v === 'number').map(Number);
      return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null;
    };
    const nextDayDates = ptDates.map(d => offsetDate(d, 1)).filter(d => d <= today);
    const treatmentDays = healthData.filter(h => h.treatment_notes?.trim()).length;
    return {
      ptDays: ptDates.length,
      treatmentDays,
      painPT: avg(ptDates, 'pain'),
      painNonPT: avg(nonPtDates, 'pain'),
      painNext: avg(nextDayDates, 'pain'),
      energyPT: avg(ptDates, 'energy'),
      energyNonPT: avg(nonPtDates, 'energy'),
      moodPT: avg(ptDates, 'mood'),
      moodNonPT: avg(nonPtDates, 'mood'),
    };
  }, [healthData, ptSessions, startDate, today]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '92dvh' }}
      >
        <div className="px-5 pt-4 pb-3 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">Progress Report</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">Your recovery at a glance</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-2.5 border-b border-stone-100 flex gap-2 flex-shrink-0">
          {(['1W', '2W', '1M', '3M'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: range === r ? '#F6F1E7' : 'transparent',
                color: range === r ? '#57534e' : '#a8a29e',
                border: range === r ? '1px solid #e7e5e4' : '1px solid transparent',
              }}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="px-5 py-2.5 border-b border-stone-100 flex gap-2 flex-shrink-0">
          {(['overview', 'pt'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: tab === t ? '#E4ECE6' : 'transparent',
                color: tab === t ? '#476653' : '#a8a29e',
                border: tab === t ? '1px solid #cfded3' : '1px solid transparent',
              }}
            >
              {t === 'overview' ? 'Overview' : 'PT impact'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#7E9B86] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="px-5 py-4 space-y-6">
              {tab === 'pt' ? (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="bg-[#F6F1E7] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-stone-800 leading-none">{ptImpact.ptDays}</p>
                      <p className="text-[10px] text-stone-500 mt-1 font-medium leading-tight">PT days</p>
                    </div>
                    <div className="bg-[#F6F1E7] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold leading-none" style={{ color: '#C96B7A' }}>{ptImpact.painNext ?? '—'}</p>
                      <p className="text-[10px] text-stone-500 mt-1 font-medium leading-tight">next-day pain</p>
                    </div>
                    <div className="bg-[#F6F1E7] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold leading-none" style={{ color: '#5B9BD5' }}>{ptImpact.treatmentDays}</p>
                      <p className="text-[10px] text-stone-500 mt-1 font-medium leading-tight">treatment days</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-stone-100 p-3 bg-stone-50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">PT day vs non-PT day averages</p>
                    <div className="space-y-2 text-xs text-stone-600">
                      <p>Pain: <span className="font-semibold text-[#C96B7A]">{ptImpact.painPT ?? '—'}</span> on PT days vs <span className="font-semibold">{ptImpact.painNonPT ?? '—'}</span> non-PT</p>
                      <p>Energy: <span className="font-semibold text-[#D9A94B]">{ptImpact.energyPT ?? '—'}</span> on PT days vs <span className="font-semibold">{ptImpact.energyNonPT ?? '—'}</span> non-PT</p>
                      <p>Mood: <span className="font-semibold text-[#7E9B86]">{ptImpact.moodPT ?? '—'}</span> on PT days vs <span className="font-semibold">{ptImpact.moodNonPT ?? '—'}</span> non-PT</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-stone-400 leading-relaxed text-center">
                    These are simple averages, not medical conclusions. They help spot patterns between PT sessions, next-day symptoms, wellbeing, and treatment logs.
                  </p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="bg-[#F6F1E7] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-stone-800 leading-none">{stats.streak}</p>
                      <p className="text-[10px] text-stone-500 mt-1 font-medium leading-tight">day streak</p>
                    </div>
                    <div className="bg-[#F6F1E7] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold leading-none" style={{ color: '#7E9B86' }}>{stats.overallRate}%</p>
                      <p className="text-[10px] text-stone-500 mt-1 font-medium leading-tight">completion</p>
                    </div>
                    <div className="bg-[#F6F1E7] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold leading-none" style={{ color: '#D9A94B' }}>{stats.ptInRange}</p>
                      <p className="text-[10px] text-stone-500 mt-1 font-medium leading-tight">PT sessions</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Pain Level</p>
                      {stats.avgPain && (
                        <p className="text-[10px] text-stone-400">avg <span className="font-semibold text-stone-500">{stats.avgPain}/10</span></p>
                      )}
                    </div>
                    <LineChart data={painData} color="#E88E8E" />
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Wellbeing</p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ background: '#D9A94B' }} />
                          <span className="text-[10px] text-stone-400">Energy</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ background: '#9B8EC4' }} />
                          <span className="text-[10px] text-stone-400">Mood</span>
                        </div>
                      </div>
                    </div>
                    <MultiLineChart
                      series={[
                        { data: energyData, color: '#D9A94B' },
                        { data: moodData, color: '#9B8EC4' },
                      ]}
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Weekly Completion</p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-[#7E9B86]" />
                          <span className="text-[10px] text-stone-400">Mobility</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-[#C17B4F]" />
                          <span className="text-[10px] text-stone-400">Strength</span>
                        </div>
                      </div>
                    </div>
                    <WeeklyBarChart weeks={weeklyData} />
                  </div>

                  <p className="text-[11px] text-stone-400 text-center pb-1">
                    {stats.daysActive} active day{stats.daysActive !== 1 ? 's' : ''} in this period
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
