'use client';

import { useState, useEffect, useRef } from 'react';

interface HealthData {
  sleep_hours: number | null;
  sleep_quality: number | null;
  energy: number | null;
  mood: number | null;
  pain: number | null;
}

const EMPTY: HealthData = {
  sleep_hours: null,
  sleep_quality: null,
  energy: null,
  mood: null,
  pain: null,
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
  color: 'sage' | 'clay' | 'gold' | 'sky' | 'rose';
  onChange: (v: number) => void;
}

const COLOR_MAP = {
  sage:  { track: '#7E9B86', soft: '#E4ECE6', text: '#7E9B86' },
  clay:  { track: '#C17B4F', soft: '#F4E3D6', text: '#C17B4F' },
  gold:  { track: '#D9A94B', soft: '#FBF0D8', text: '#B8883A' },
  sky:   { track: '#5B9BD5', soft: '#E0EDFA', text: '#4A82B8' },
  rose:  { track: '#C96B7A', soft: '#F9E4E7', text: '#C96B7A' },
};

function Slider({ label, description, value, min, max, step = 1, lowLabel, highLabel, color, onChange }: SliderProps) {
  const c = COLOR_MAP[color];
  const pct = value !== null ? ((value - min) / (max - min)) * 100 : 0;
  const hasValue = value !== null;

  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-sm font-semibold text-stone-800">{label}</span>
        {hasValue && (
          <span className="text-sm font-bold" style={{ color: c.text }}>
            {value}{max === 12 ? 'h' : '/10'}
          </span>
        )}
      </div>
      <p className="text-xs text-stone-400 mb-2 leading-snug">{description}</p>

      <div className="relative h-8 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-2 rounded-full bg-stone-100" />
        {/* Fill */}
        {hasValue && (
          <div
            className="absolute left-0 h-2 rounded-full transition-all duration-100"
            style={{ width: `${pct}%`, background: c.track }}
          />
        )}
        {/* Input */}
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
        <span className="text-[10px] text-stone-400">{lowLabel}</span>
        <span className="text-[10px] text-stone-400">{highLabel}</span>
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/health?date=${today}`)
      .then((r) => r.json())
      .then(({ row }) => {
        if (row) {
          setData({
            sleep_hours: row.sleep_hours !== null ? Number(row.sleep_hours) : null,
            sleep_quality: row.sleep_quality,
            energy: row.energy,
            mood: row.mood,
            pain: row.pain,
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [today]);

  const update = (field: keyof HealthData, value: number) => {
    const next = { ...data, [field]: value };
    setData(next);
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

  return (
    <div className="bg-white border border-stone-100 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg font-semibold text-stone-800">How are you feeling?</h2>
        {saved && <span className="text-xs text-sage font-medium">Saved ✓</span>}
        {loading && <span className="text-xs text-stone-400">Loading…</span>}
      </div>

      <style>{`
        input[type=range] { height: 32px; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--thumb-color);
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--thumb-color);
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          cursor: pointer;
        }
      `}</style>

      <Slider
        label="Sleep duration"
        description="How many hours of sleep did you get last night?"
        value={data.sleep_hours}
        min={0}
        max={12}
        step={0.5}
        lowLabel="0 h"
        highLabel="12 h"
        color="sky"
        onChange={(v) => update('sleep_hours', v)}
      />
      <Slider
        label="Sleep quality"
        description="0 = couldn't sleep at all · 10 = restful, uninterrupted"
        value={data.sleep_quality}
        min={0}
        max={10}
        lowLabel="0"
        highLabel="10"
        color="sky"
        onChange={(v) => update('sleep_quality', v)}
      />
      <Slider
        label="Energy"
        description="0 = absolutely no energy · 10 = fully charged"
        value={data.energy}
        min={0}
        max={10}
        lowLabel="0"
        highLabel="10"
        color="gold"
        onChange={(v) => update('energy', v)}
      />
      <Slider
        label="Mood"
        description="0 = completely flat · 10 = best day ever"
        value={data.mood}
        min={0}
        max={10}
        lowLabel="0"
        highLabel="10"
        color="sage"
        onChange={(v) => update('mood', v)}
      />
      <Slider
        label="Pain"
        description="0 = no pain · 10 = worst pain you've ever had"
        value={data.pain}
        min={0}
        max={10}
        lowLabel="0"
        highLabel="10"
        color="rose"
        onChange={(v) => update('pain', v)}
      />
    </div>
  );
}
