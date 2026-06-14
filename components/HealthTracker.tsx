'use client';

import { useState, useEffect, useRef } from 'react';

interface HealthData {
  sleep_hours: number | null;
  sleep_quality: number | null;
  energy: number | null;
  mood: number | null;
  pain: number | null;
  sleep_notes: string;
  energy_notes: string;
  mood_notes: string;
  pain_notes: string;
  general_notes: string;
}

const EMPTY: HealthData = {
  sleep_hours: null,
  sleep_quality: null,
  energy: null,
  mood: null,
  pain: null,
  sleep_notes: '',
  energy_notes: '',
  mood_notes: '',
  pain_notes: '',
  general_notes: '',
};

const COLOR_MAP = {
  sage:  { track: '#7E9B86', text: '#7E9B86' },
  clay:  { track: '#C17B4F', text: '#C17B4F' },
  gold:  { track: '#D9A94B', text: '#B8883A' },
  sky:   { track: '#5B9BD5', text: '#4A82B8' },
  rose:  { track: '#C96B7A', text: '#C96B7A' },
};

interface SliderProps {
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
}

function Slider({ label, description, value, min, max, step = 1, lowLabel, highLabel, color, note, onNoteChange, onChange }: SliderProps) {
  const c = COLOR_MAP[color];
  const pct = value !== null ? ((value - min) / (max - min)) * 100 : 0;
  const hasValue = value !== null;
  const [showNote, setShowNote] = useState(!!note);

  // Auto-reveal the note field when a saved note loads from the DB
  useEffect(() => {
    if (note) setShowNote(true);
  }, [note]);

  return (
    <div className="mb-5 last:mb-0">
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

interface Props {
  today: string;
}

export default function HealthTracker({ today }: Props) {
  const [data, setData] = useState<HealthData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cancel any in-flight debounced save from the previous date
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
            sleep_quality: row.sleep_quality ?? null,
            energy: row.energy ?? null,
            mood: row.mood ?? null,
            pain: row.pain ?? null,
            sleep_notes: row.sleep_notes ?? '',
            energy_notes: row.energy_notes ?? '',
            mood_notes: row.mood_notes ?? '',
            pain_notes: row.pain_notes ?? '',
            general_notes: row.general_notes ?? '',
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [today]);

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
        <h2 className="font-serif text-lg font-semibold" style={{ color: '#1c1917' }}>How are you feeling?</h2>
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

      <Slider
        label="Sleep duration"
        description="How many hours of sleep did you get last night?"
        value={data.sleep_hours}
        min={0} max={12} step={0.5}
        lowLabel="0 h" highLabel="12 h"
        color="sky"
        note={data.sleep_notes}
        onNoteChange={(v) => updateNote('sleep_notes', v)}
        onChange={(v) => updateNum('sleep_hours', v)}
      />
      <Slider
        label="Sleep quality"
        description="0 = couldn't sleep at all · 10 = restful, uninterrupted"
        value={data.sleep_quality}
        min={0} max={10}
        lowLabel="Poor" highLabel="Great"
        color="sky"
        note={data.sleep_notes}
        onNoteChange={(v) => updateNote('sleep_notes', v)}
        onChange={(v) => updateNum('sleep_quality', v)}
      />
      <Slider
        label="Energy"
        description="0 = completely drained · 10 = fully charged and ready to go"
        value={data.energy}
        min={0} max={10}
        lowLabel="Exhausted" highLabel="Energized"
        color="gold"
        note={data.energy_notes}
        onNoteChange={(v) => updateNote('energy_notes', v)}
        onChange={(v) => updateNum('energy', v)}
      />
      <Slider
        label="Mood"
        description="0 = really struggling · 10 = feeling great today"
        value={data.mood}
        min={0} max={10}
        lowLabel="Low" highLabel="Great"
        color="sage"
        note={data.mood_notes}
        onNoteChange={(v) => updateNote('mood_notes', v)}
        onChange={(v) => updateNum('mood', v)}
      />
      <Slider
        label="Pain level"
        description="0 = no pain at all · 10 = worst pain you've ever had"
        value={data.pain}
        min={0} max={10}
        lowLabel="No pain" highLabel="Worst pain"
        color="rose"
        note={data.pain_notes}
        onNoteChange={(v) => updateNote('pain_notes', v)}
        onChange={(v) => updateNum('pain', v)}
      />

      {/* General notes */}
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
    </div>
  );
}
