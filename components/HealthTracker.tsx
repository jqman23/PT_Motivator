'use client';

import { useState, useEffect, useRef } from 'react';

interface HealthData {
  sleep_hours: number | null;
  sleep_quality: number | null;
  energy: number | null;
  mood: number | null;
  pain: number | null;
  sleep_notes: string;
  sleep_quality_notes: string;
  energy_notes: string;
  mood_notes: string;
  pain_notes: string;
  general_notes: string;
  treatment_notes: string;
}

type MetricKey = 'sleep_hours' | 'sleep_quality' | 'energy' | 'mood' | 'pain';
type TrendRow = Partial<Record<MetricKey, number | string | null>> & { date: string };

const EMPTY: HealthData = {
  sleep_hours: null,
  sleep_quality: null,
  energy: null,
  mood: null,
  pain: null,
  sleep_notes: '',
  sleep_quality_notes: '',
  energy_notes: '',
  mood_notes: '',
  pain_notes: '',
  general_notes: '',
  treatment_notes: '',
};

const COLOR_MAP = {
  sage:  { track: '#7E9B86', text: '#7E9B86' },
  clay:  { track: '#C17B4F', text: '#C17B4F' },
  gold:  { track: '#D9A94B', text: '#B8883A' },
  sky:   { track: '#5B9BD5', text: '#4A82B8' },
  rose:  { track: '#C96B7A', text: '#C96B7A' },
};

const METRICS: Record<MetricKey, { label: string; max: number; suffix: string; color: keyof typeof COLOR_MAP }> = {
  sleep_hours: { label: 'Sleep duration', max: 12, suffix: 'h', color: 'sky' },
  sleep_quality: { label: 'Sleep quality', max: 10, suffix: '/10', color: 'sky' },
  energy: { label: 'Energy', max: 10, suffix: '/10', color: 'gold' },
  mood: { label: 'Mood', max: 10, suffix: '/10', color: 'sage' },
  pain: { label: 'Pain level', max: 10, suffix: '/10', color: 'rose' },
};

function dateStr(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function offsetDate(base: string, days: number) {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

function shortDate(value: string) {
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function longDate(value: string) {
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

interface SliderProps {
  metric: MetricKey;
  label: string;
  description: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  lowLabel: string;
  highLabel: string;
  color: keyof typeof COLOR_MAP;
  note: string;
  onNoteChange: (v: string) => void;
  onChange: (v: number) => void;
  onShowTrend: (metric: MetricKey) => void;
}

function Slider({ metric, label, description, value, min, max, step = 1, lowLabel, highLabel, color, note, onNoteChange, onChange, onShowTrend }: SliderProps) {
  const c = COLOR_MAP[color];
  const pct = value !== null ? ((value - min) / (max - min)) * 100 : 0;
  const hasValue = value !== null;
  const [showNote, setShowNote] = useState(!!note);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (note) setShowNote(true);
  }, [note]);

  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const startHold = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button')) return;
    cancelHold();
    holdTimer.current = setTimeout(() => onShowTrend(metric), 450);
  };

  return (
    <div
      className="mb-5 last:mb-0 rounded-xl -mx-2 px-2 py-1 transition-colors hover:bg-stone-50/60"
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={e => e.preventDefault()}
      title="Hold for trend chart"
    >
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-sm font-semibold" style={{ color: '#1c1917' }}>{label}</span>
        <div className="flex items-center gap-2">
          {hasValue && (
            <span className="text-sm font-bold" style={{ color: c.text }}>
              {value}{max === 12 ? 'h' : '/10'}
            </span>
          )}
          <button
            onClick={() => setShowNote(s => !s)}
            className="text-[10px] font-semibold text-stone-400 hover:text-stone-600 transition-colors"
            title="Add note"
          >
            {showNote ? '− note' : '+ note'}
          </button>
        </div>
      </div>
      <p className="text-xs mb-2 leading-snug" style={{ color: '#78716c' }}>{description}</p>

      <div className="relative h-8 flex items-center">
        <div className="absolute inset-x-0 h-2 rounded-full" style={{ background: '#e7e5e4' }} />
        {hasValue && (
          <div
            className="absolute left-0 h-2 rounded-full transition-all duration-100"
            style={{ width: `${pct}%`, background: c.track }}
          />
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative w-full appearance-none bg-transparent cursor-pointer"
          style={{ '--thumb-color': c.track } as React.CSSProperties}
        />
      </div>

      <div className="flex justify-between mt-0.5">
        <span className="text-[10px]" style={{ color: '#a8a29e' }}>{lowLabel}</span>
        <span className="text-[10px]" style={{ color: '#a8a29e' }}>{highLabel}</span>
      </div>

      {showNote && (
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={`Notes on ${label.toLowerCase()}…`}
          rows={2}
          className="mt-2 w-full text-xs resize-none rounded-lg border px-2.5 py-2 focus:outline-none focus:ring-1"
          style={{
            color: '#44403c',
            borderColor: '#e7e5e4',
            background: '#fafaf9',
            boxSizing: 'border-box',
          }}
          onFocus={e => (e.target.style.borderColor = c.track)}
          onBlur={e => (e.target.style.borderColor = '#e7e5e4')}
        />
      )}
    </div>
  );
}

function TrendOverlay({ metric, rows, loading, error, onClose }: { metric: MetricKey; rows: TrendRow[]; loading: boolean; error: string; onClose: () => void }) {
  const config = METRICS[metric];
  const color = COLOR_MAP[config.color];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const values = rows
    .map(row => ({ date: String(row.date).split('T')[0], value: row[metric] === null || row[metric] === undefined || row[metric] === '' ? null : Number(row[metric]) }))
    .filter((row): row is { date: string; value: number } => Number.isFinite(row.value));

  const width = 300;
  const height = 130;
  const padX = 22;
  const padTop = 14;
  const padBottom = 26;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;
  const x = (index: number) => values.length <= 1 ? width / 2 : padX + (index / (values.length - 1)) * chartW;
  const y = (value: number) => padTop + (1 - Math.max(0, Math.min(1, value / config.max))) * chartH;
  const path = values.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
  const latest = values.at(-1)?.value;
  const avg = values.length ? values.reduce((sum, row) => sum + row.value, 0) / values.length : null;
  const selectedPoint = selectedIndex !== null ? values[selectedIndex] : null;
  const formatValue = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${Number.isInteger(n) ? n : n.toFixed(1)}${config.suffix}`;
  const goToDate = (date: string) => {
    localStorage.setItem('pt-selected-date', date);
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-stone-900/35 backdrop-blur-[2px] px-4 py-5" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-stone-100 p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Last 3 weeks</p>
            <h3 className="font-serif text-lg font-semibold text-stone-800">{config.label}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 text-stone-500 text-xl leading-none" style={{ touchAction: 'manipulation' }}>×</button>
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center text-xs text-stone-400">Loading chart…</div>
        ) : error ? (
          <div className="h-40 flex items-center justify-center text-xs text-red-500">{error}</div>
        ) : values.length < 2 ? (
          <div className="h-40 flex items-center justify-center text-xs text-stone-400 text-center px-8">Need at least 2 logged days for this chart.</div>
        ) : (
          <>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" role="img" aria-label={`${config.label} trend chart`}>
              <line x1={padX} y1={padTop} x2={padX} y2={height - padBottom} stroke="#e7e5e4" strokeWidth="1" />
              <line x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} stroke="#e7e5e4" strokeWidth="1" />
              <line x1={padX} y1={y(config.max / 2)} x2={width - padX} y2={y(config.max / 2)} stroke="#f5f5f4" strokeWidth="1" />
              <path d={path} fill="none" stroke={color.track} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {values.map((point, index) => {
                const selected = selectedIndex === index;
                return (
                  <g key={`${point.date}-${index}`} onClick={e => { e.stopPropagation(); setSelectedIndex(index); }} style={{ cursor: 'pointer' }}>
                    <circle cx={x(index)} cy={y(point.value)} r="10" fill="transparent" />
                    <circle cx={x(index)} cy={y(point.value)} r={selected ? 5 : 3.2} fill={selected ? color.track : 'white'} stroke={color.track} strokeWidth="2" />
                  </g>
                );
              })}
              <text x={padX} y={height - 7} fill="#a8a29e" fontSize="10">{shortDate(values[0].date)}</text>
              <text x={width - padX} y={height - 7} fill="#a8a29e" fontSize="10" textAnchor="end">{shortDate(values[values.length - 1].date)}</text>
              <text x={width - padX} y={padTop + 8} fill="#a8a29e" fontSize="10" textAnchor="end">{config.max}{config.suffix}</text>
            </svg>
            {selectedPoint && (
              <button
                onClick={() => goToDate(selectedPoint.date)}
                className="mb-2 w-full rounded-2xl border px-3 py-2 text-left transition-all hover:shadow-sm active:scale-[0.99]"
                style={{ borderColor: `${color.track}55`, background: '#fafaf9', touchAction: 'manipulation' }}
                title={`Go to ${longDate(selectedPoint.date)}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Selected day · tap to open</p>
                <p className="text-sm font-bold text-stone-800">{longDate(selectedPoint.date)} · <span style={{ color: color.text }}>{formatValue(selectedPoint.value)}</span></p>
              </button>
            )}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="rounded-xl bg-stone-50 px-3 py-2"><p className="text-[10px] uppercase font-bold text-stone-400">Latest</p><p className="text-sm font-bold" style={{ color: color.text }}>{formatValue(latest)}</p></div>
              <div className="rounded-xl bg-stone-50 px-3 py-2"><p className="text-[10px] uppercase font-bold text-stone-400">Average</p><p className="text-sm font-bold text-stone-700">{formatValue(avg)}</p></div>
              <div className="rounded-xl bg-stone-50 px-3 py-2"><p className="text-[10px] uppercase font-bold text-stone-400">Logged</p><p className="text-sm font-bold text-stone-700">{values.length} days</p></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface Props {
  today: string;
}

export default function HealthTracker({ today }: Props) {
  const [data, setData] = useState<HealthData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [trendMetric, setTrendMetric] = useState<MetricKey | null>(null);
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setLoading(true);
    setSaved(false);
    setData(EMPTY);
    fetch(`/api/health?date=${today}`)
      .then((r) => r.json())
      .then(({ row }) => {
        if (row) {
          setData({
            sleep_hours: row.sleep_hours !== null ? Number(row.sleep_hours) : null,
            sleep_quality: row.sleep_quality !== null ? Number(row.sleep_quality) : null,
            energy: row.energy !== null ? Number(row.energy) : null,
            mood: row.mood !== null ? Number(row.mood) : null,
            pain: row.pain !== null ? Number(row.pain) : null,
            sleep_notes: row.sleep_notes ?? '',
            sleep_quality_notes: row.sleep_quality_notes ?? '',
            energy_notes: row.energy_notes ?? '',
            mood_notes: row.mood_notes ?? '',
            pain_notes: row.pain_notes ?? '',
            general_notes: row.general_notes ?? '',
            treatment_notes: row.treatment_notes ?? '',
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [today]);

  useEffect(() => {
    if (!trendMetric) return;
    setTrendLoading(true);
    setTrendError('');
    fetch(`/api/health?start=${offsetDate(today, -20)}&end=${today}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Could not load trend')))
      .then(({ rows }) => setTrendRows(Array.isArray(rows) ? rows : []))
      .catch(err => {
        console.error(err);
        setTrendError('Could not load trend.');
        setTrendRows([]);
      })
      .finally(() => setTrendLoading(false));
  }, [trendMetric, today]);

  const scheduleSave = (next: HealthData) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today, ...next }),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error(err);
      }
    }, 600);
  };

  const updateNum = (field: keyof HealthData, value: number) => {
    const next = { ...data, [field]: value };
    setData(next);
    scheduleSave(next);
  };

  const updateNote = (field: keyof HealthData, value: string) => {
    const next = { ...data, [field]: value };
    setData(next);
    scheduleSave(next);
  };

  const handleReset = async () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false);
    setData(EMPTY);
    setSaved(false);
    try {
      await fetch(`/api/health?date=${today}`, { method: 'DELETE' });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="rounded-2xl border p-4" style={{ background: '#ffffff', borderColor: '#e7e5e4' }}>
      <style>{`
        input[type=range] { height: 32px; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px; height: 20px;
          border-radius: 50%;
          background: var(--thumb-color);
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 20px; height: 20px;
          border-radius: 50%;
          background: var(--thumb-color);
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          cursor: pointer;
        }
      `}</style>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-serif text-lg font-semibold" style={{ color: '#1c1917' }}>How are you feeling?</h2>
          <p className="text-[10px] text-stone-400 mt-0.5">Hold a metric to view its 3-week trend.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-medium" style={{ color: '#7E9B86' }}>Saved ✓</span>}
          {loading && <span className="text-xs" style={{ color: '#a8a29e' }}>Loading…</span>}
          {confirmReset ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: '#a8a29e' }}>Clear all?</span>
              <button
                onClick={handleReset}
                className="text-xs font-bold px-2 py-0.5 rounded-md text-white"
                style={{ background: '#C96B7A' }}
              >Yes</button>
              <button
                onClick={() => setConfirmReset(false)}
                className="text-xs font-semibold px-2 py-0.5 rounded-md"
                style={{ color: '#78716c', background: '#f5f5f4' }}
              >No</button>
            </div>
          ) : (
            <button
              onClick={handleReset}
              className="text-xs font-semibold px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#a8a29e', background: '#f5f5f4' }}
              title="Reset all health data for this day"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <Slider metric="sleep_hours" label="Sleep duration" description="How many hours of sleep did you get last night?" value={data.sleep_hours} min={0} max={12} step={0.5} lowLabel="0 h" highLabel="12 h" color="sky" note={data.sleep_notes} onNoteChange={(v) => updateNote('sleep_notes', v)} onChange={(v) => updateNum('sleep_hours', v)} onShowTrend={setTrendMetric} />
      <Slider metric="sleep_quality" label="Sleep quality" description="0 = couldn't sleep at all · 10 = restful, uninterrupted" value={data.sleep_quality} min={0} max={10} step={0.5} lowLabel="Poor" highLabel="Great" color="sky" note={data.sleep_quality_notes} onNoteChange={(v) => updateNote('sleep_quality_notes', v)} onChange={(v) => updateNum('sleep_quality', v)} onShowTrend={setTrendMetric} />
      <Slider metric="energy" label="Energy" description="0 = completely drained · 10 = fully charged and ready to go" value={data.energy} min={0} max={10} step={0.5} lowLabel="Exhausted" highLabel="Energized" color="gold" note={data.energy_notes} onNoteChange={(v) => updateNote('energy_notes', v)} onChange={(v) => updateNum('energy', v)} onShowTrend={setTrendMetric} />
      <Slider metric="mood" label="Mood" description="0 = really struggling · 10 = feeling great today" value={data.mood} min={0} max={10} step={0.5} lowLabel="Low" highLabel="Great" color="sage" note={data.mood_notes} onNoteChange={(v) => updateNote('mood_notes', v)} onChange={(v) => updateNum('mood', v)} onShowTrend={setTrendMetric} />
      <Slider metric="pain" label="Pain level" description="0 = no pain at all · 10 = highest pain" value={data.pain} min={0} max={10} step={0.5} lowLabel="No pain" highLabel="Highest" color="rose" note={data.pain_notes} onNoteChange={(v) => updateNote('pain_notes', v)} onChange={(v) => updateNum('pain', v)} onShowTrend={setTrendMetric} />

      <div className="mt-5 pt-4" style={{ borderTop: '1px solid #e7e5e4' }}>
        <label className="block text-sm font-semibold mb-1" style={{ color: '#1c1917' }}>
          Meds / treatments
        </label>
        <p className="text-xs mb-2" style={{ color: '#78716c' }}>
          Log anything relevant you took or used today.
        </p>
        <textarea
          value={data.treatment_notes}
          onChange={(e) => updateNote('treatment_notes', e.target.value)}
          placeholder="Meloxicam AM, Advil PM, none today…"
          rows={2}
          className="w-full text-sm resize-none rounded-xl border px-3 py-2.5 focus:outline-none focus:ring-2 transition-shadow"
          style={{
            color: '#44403c',
            borderColor: '#e7e5e4',
            background: '#fafaf9',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div className="mt-5 pt-4" style={{ borderTop: '1px solid #e7e5e4' }}>
        <label className="block text-sm font-semibold mb-1" style={{ color: '#1c1917' }}>
          General notes
        </label>
        <p className="text-xs mb-2" style={{ color: '#78716c' }}>
          How was your day overall? Any observations, questions for your PT, or things to remember?
        </p>
        <textarea
          value={data.general_notes}
          onChange={(e) => updateNote('general_notes', e.target.value)}
          placeholder="Feeling better than yesterday, ankle still stiff in the morning…"
          rows={3}
          className="w-full text-sm resize-none rounded-xl border px-3 py-2.5 focus:outline-none focus:ring-2 transition-shadow"
          style={{
            color: '#44403c',
            borderColor: '#e7e5e4',
            background: '#fafaf9',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {trendMetric && <TrendOverlay metric={trendMetric} rows={trendRows} loading={trendLoading} error={trendError} onClose={() => setTrendMetric(null)} />}
    </div>
  );
}
