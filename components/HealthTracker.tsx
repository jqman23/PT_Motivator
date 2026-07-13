'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import SecretTextarea from './SecretTextarea';

type GeneralNotePhoto = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
};

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
  general_note_photos: GeneralNotePhoto[];
}

type MetricKey = 'sleep_hours' | 'sleep_quality' | 'energy' | 'mood' | 'pain';
type TrendRangeKey = '3wk' | '6wk';
type TrendRow = Partial<Record<MetricKey, number | string | null>> & { date: string };

const MAX_GENERAL_NOTE_PHOTOS = 5;
const MAX_PHOTO_DIMENSION = 1100;
const PHOTO_QUALITY = 0.76;

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
  general_note_photos: [],
};

const TREND_RANGES: Record<TrendRangeKey, { label: string; days: number }> = {
  '3wk': { label: 'Last 3 weeks', days: 20 },
  '6wk': { label: 'Last 6 weeks', days: 41 },
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

function cleanGeneralNotePhotos(value: unknown): GeneralNotePhoto[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<GeneralNotePhoto> => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `photo-${Date.now()}-${index}`,
      name: typeof item.name === 'string' && item.name ? item.name : 'Daily note photo',
      type: typeof item.type === 'string' && item.type ? item.type : 'image/jpeg',
      dataUrl: typeof item.dataUrl === 'string' ? item.dataUrl : '',
      createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
    }))
    .filter(photo => photo.dataUrl.startsWith('data:image/'))
    .slice(0, MAX_GENERAL_NOTE_PHOTOS);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = dataUrl;
  });
}

async function fileToGeneralNotePhoto(file: File): Promise<GeneralNotePhoto> {
  const originalDataUrl = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(originalDataUrl);
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, width, height);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name || 'Daily note photo',
      type: 'image/jpeg',
      dataUrl: canvas.toDataURL('image/jpeg', PHOTO_QUALITY),
      createdAt: new Date().toISOString(),
    };
  } catch {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name || 'Daily note photo',
      type: file.type || 'image/jpeg',
      dataUrl: originalDataUrl,
      createdAt: new Date().toISOString(),
    };
  }
}

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
        <SecretTextarea
          value={note}
          onChange={onNoteChange}
          placeholder={`Notes on ${label.toLowerCase()}…`}
          rows={2}
          className="mt-2 w-full text-xs resize-y rounded-lg border px-2.5 py-2 focus:outline-none focus:ring-1"
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

function TrendOverlay({ metric, rows, range, loading, error, onClose, onRangeChange }: { metric: MetricKey; rows: TrendRow[]; range: TrendRangeKey; loading: boolean; error: string; onClose: () => void; onRangeChange: (range: TrendRangeKey) => void }) {
  const config = METRICS[metric];
  const color = COLOR_MAP[config.color];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const values = rows
    .map(row => ({ date: String(row.date).split('T')[0], value: row[metric] === null || row[metric] === undefined || row[metric] === '' ? null : Number(row[metric]) }))
    .filter((row): row is { date: string; value: number } => Number.isFinite(row.value));

  useEffect(() => {
    setSelectedIndex(null);
  }, [metric, range]);

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
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{TREND_RANGES[range].label}</p>
            <h3 className="font-serif text-lg font-semibold text-stone-800">{config.label}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 text-stone-500 text-xl leading-none" style={{ touchAction: 'manipulation' }}>×</button>
        </div>

        <div className="mb-3 inline-flex rounded-full border bg-stone-50 p-0.5" style={{ borderColor: '#e7e5e4' }}>
          {(Object.keys(TREND_RANGES) as TrendRangeKey[]).map(key => {
            const selected = key === range;
            return (
              <button
                key={key}
                onClick={() => onRangeChange(key)}
                className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-all"
                style={{
                  color: selected ? '#ffffff' : '#78716c',
                  background: selected ? color.track : 'transparent',
                  touchAction: 'manipulation',
                }}
              >
                {key}
              </button>
            );
          })}
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
  const [trendRange, setTrendRange] = useState<TrendRangeKey>('3wk');
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<GeneralNotePhoto | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<HealthData>(EMPTY);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setLoading(true);
    setSaved(false);
    setPhotoError('');
    setPreparingPhotos(false);
    setSelectedPhoto(null);
    dataRef.current = EMPTY;
    setData(EMPTY);
    fetch(`/api/health?date=${today}`)
      .then((r) => r.json())
      .then(({ row }) => {
        if (row) {
          const next: HealthData = {
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
            general_note_photos: cleanGeneralNotePhotos(row.general_note_photos),
          };
          dataRef.current = next;
          setData(next);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [today]);

  useEffect(() => {
    if (!trendMetric) return;
    setTrendLoading(true);
    setTrendError('');
    fetch(`/api/health?start=${offsetDate(today, -TREND_RANGES[trendRange].days)}&end=${today}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Could not load trend')))
      .then(({ rows }) => setTrendRows(Array.isArray(rows) ? rows : []))
      .catch(err => {
        console.error(err);
        setTrendError('Could not load trend.');
        setTrendRows([]);
      })
      .finally(() => setTrendLoading(false));
  }, [trendMetric, trendRange, today]);

  const scheduleSave = (next: HealthData) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today, ...next }),
        });
        if (!res.ok) throw new Error('Could not save health data.');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error(err);
        setPhotoError(err instanceof Error ? err.message : 'Could not save daily notes.');
      }
    }, 600);
  };

  const commitData = (next: HealthData) => {
    dataRef.current = next;
    setData(next);
    scheduleSave(next);
  };

  const updateNum = (field: keyof HealthData, value: number) => {
    commitData({ ...dataRef.current, [field]: value });
  };

  const updateNote = (field: keyof HealthData, value: string) => {
    commitData({ ...dataRef.current, [field]: value });
  };

  const handlePhotoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith('image/'));
    event.target.value = '';
    if (files.length === 0) return;

    const remaining = MAX_GENERAL_NOTE_PHOTOS - dataRef.current.general_note_photos.length;
    if (remaining <= 0) {
      setPhotoError(`Maximum ${MAX_GENERAL_NOTE_PHOTOS} photos per day.`);
      return;
    }

    setPhotoError('');
    setPreparingPhotos(true);
    try {
      const converted = await Promise.all(files.slice(0, remaining).map(fileToGeneralNotePhoto));
      const next = {
        ...dataRef.current,
        general_note_photos: [...dataRef.current.general_note_photos, ...converted].slice(0, MAX_GENERAL_NOTE_PHOTOS),
      };
      commitData(next);
      if (files.length > remaining) setPhotoError(`Added ${remaining}. Maximum ${MAX_GENERAL_NOTE_PHOTOS} photos per day.`);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not attach photo.');
    } finally {
      setPreparingPhotos(false);
    }
  };

  const removePhoto = (id: string) => {
    const next = {
      ...dataRef.current,
      general_note_photos: dataRef.current.general_note_photos.filter(photo => photo.id !== id),
    };
    if (selectedPhoto?.id === id) setSelectedPhoto(null);
    setPhotoError('');
    commitData(next);
  };

  const handleReset = async () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false);
    dataRef.current = EMPTY;
    setData(EMPTY);
    setSaved(false);
    setPhotoError('');
    setSelectedPhoto(null);
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoPick}
      />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-serif text-lg font-semibold" style={{ color: '#1c1917' }}>How are you feeling?</h2>
          <p className="text-[10px] text-stone-400 mt-0.5">Hold a metric to view its trend, then toggle 3wk or 6wk.</p>
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
        <SecretTextarea
          value={data.treatment_notes}
          onChange={(value) => updateNote('treatment_notes', value)}
          placeholder="Meloxicam AM, Advil PM, none today…"
          rows={2}
          className="w-full text-sm resize-y rounded-xl border px-3 py-2.5 focus:outline-none focus:ring-2 transition-shadow"
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
        <div className="mb-1 flex items-center justify-between gap-3">
          <label className="block text-sm font-semibold" style={{ color: '#1c1917' }}>
            General notes
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={preparingPhotos || data.general_note_photos.length >= MAX_GENERAL_NOTE_PHOTOS}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40"
            style={{ color: '#476653', background: '#E4ECE6', touchAction: 'manipulation' }}
          >
            {preparingPhotos ? 'Preparing…' : '📷 Add photo'}
          </button>
        </div>
        <p className="text-xs mb-2" style={{ color: '#78716c' }}>
          How was your day overall? Any observations, questions for your PT, or things to remember?
        </p>
        <SecretTextarea
          value={data.general_notes}
          onChange={(value) => updateNote('general_notes', value)}
          placeholder="Feeling better than yesterday, ankle still stiff in the morning…"
          rows={3}
          className="w-full text-sm resize-y rounded-xl border px-3 py-2.5 focus:outline-none focus:ring-2 transition-shadow"
          style={{
            color: '#44403c',
            borderColor: '#e7e5e4',
            background: '#fafaf9',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />

        {data.general_note_photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {data.general_note_photos.map(photo => (
              <div key={photo.id} className="relative overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(photo)}
                  className="block w-full"
                  style={{ touchAction: 'manipulation' }}
                  title="View photo"
                >
                  <img src={photo.dataUrl} alt={photo.name || 'Daily note photo'} className="h-24 w-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-sm leading-none text-white"
                  style={{ touchAction: 'manipulation' }}
                  title="Remove photo"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="text-[10px] leading-snug text-stone-400">
            Photos are saved with this specific date. Up to {MAX_GENERAL_NOTE_PHOTOS}.
          </p>
          {data.general_note_photos.length > 0 && (
            <span className="text-[10px] font-semibold text-stone-400">{data.general_note_photos.length}/{MAX_GENERAL_NOTE_PHOTOS}</span>
          )}
        </div>
        {photoError && <p className="mt-1 text-[11px] leading-snug text-rose-600">{photoError}</p>}
      </div>

      {trendMetric && <TrendOverlay metric={trendMetric} rows={trendRows} range={trendRange} loading={trendLoading} error={trendError} onClose={() => setTrendMetric(null)} onRangeChange={setTrendRange} />}

      {selectedPhoto && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-h-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <img src={selectedPhoto.dataUrl} alt={selectedPhoto.name || 'Daily note photo'} className="max-h-[88dvh] max-w-full rounded-2xl object-contain shadow-2xl" />
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-2xl leading-none text-white"
              style={{ touchAction: 'manipulation' }}
              aria-label="Close photo"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
