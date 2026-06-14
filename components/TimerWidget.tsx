'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const PRESETS = [30, 45, 60];

export default function TimerWidget() {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(30);
  const [remaining, setRemaining] = useState(30);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playAlarm = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const beepAt = (t: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
      };
      beepAt(ctx.currentTime);
      beepAt(ctx.currentTime + 0.4);
      beepAt(ctx.currentTime + 0.8);
    } catch { /* AudioContext not available */ }
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback((d?: number) => {
    stop();
    setDone(false);
    const dur = d ?? duration;
    setRemaining(dur);
  }, [stop, duration]);

  const start = useCallback(() => {
    if (done) { reset(); return; }
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          stop();
          setDone(true);
          playAlarm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [done, reset, stop, playAlarm]);

  useEffect(() => { return () => stop(); }, [stop]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [open]);

  const selectPreset = (s: number) => {
    stop();
    setDone(false);
    setDuration(s);
    setRemaining(s);
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = remaining / duration;
  const circumference = 2 * Math.PI * 22;
  const offset = circumference * (1 - pct);

  return (
    <>
      {/* Header icon button */}
      <button
        onPointerDown={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-sm border ${
          running ? 'bg-[#D9A94B] border-[#D9A94B] text-white' :
          done    ? 'bg-[#7E9B86] border-[#7E9B86] text-white' :
                    'bg-white border-stone-200 text-stone-500'
        }`}
        title="Quick timer"
        style={{ touchAction: 'manipulation' }}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <circle cx="10" cy="11" r="7"/>
          <path d="M10 7v4l2.5 2.5"/>
          <path d="M7.5 2.5h5"/>
          <path d="M10 2.5v2"/>
        </svg>
      </button>

      {/* Fixed-position panel — stays open while using the rest of the app */}
      {open && (
        <div
          className="fixed bottom-5 right-4 z-50 bg-white rounded-2xl shadow-2xl border border-stone-100 p-4"
          style={{ width: 220, touchAction: 'manipulation' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Close + label */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Timer</span>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setOpen(false); }}
              className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 text-base leading-none"
              style={{ touchAction: 'manipulation' }}
            >×</button>
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1.5 mb-4">
            {PRESETS.map(s => (
              <button
                key={s}
                onPointerDown={(e) => { e.stopPropagation(); selectPreset(s); }}
                className="flex-1 rounded-lg text-xs font-bold transition-colors"
                style={{
                  padding: '8px 0',
                  background: duration === s && !running && !done ? '#D9A94B' : '#f5f5f4',
                  color: duration === s && !running && !done ? '#fff' : '#57534e',
                  touchAction: 'manipulation',
                }}
              >
                {s}s
              </button>
            ))}
          </div>

          {/* Ring + time */}
          <div className="flex items-center justify-center mb-4">
            <div className="relative" style={{ width: 72, height: 72 }}>
              <svg viewBox="0 0 48 48" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="24" cy="24" r="22" fill="none" stroke="#E7E5E4" strokeWidth="3.5"/>
                <circle
                  cx="24" cy="24" r="22"
                  fill="none"
                  stroke={done ? '#7E9B86' : running ? '#D9A94B' : '#C17B4F'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', fontFamily: 'inherit' }}>
                  {mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`}
                </span>
              </div>
            </div>
          </div>

          {done && (
            <p className="text-center text-xs font-bold mb-3" style={{ color: '#7E9B86' }}>Done! ✓</p>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            <button
              onPointerDown={(e) => { e.stopPropagation(); running ? stop() : start(); }}
              className="flex-1 rounded-lg text-xs font-bold transition-colors"
              style={{
                padding: '10px 0',
                background: running ? '#f5f5f4' : '#D9A94B',
                color: running ? '#57534e' : '#fff',
                touchAction: 'manipulation',
              }}
            >
              {running ? 'Pause' : done ? 'Restart' : 'Start'}
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); reset(); }}
              className="rounded-lg text-xs font-semibold transition-colors"
              style={{ padding: '10px 12px', background: '#f5f5f4', color: '#78716c', touchAction: 'manipulation' }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </>
  );
}
