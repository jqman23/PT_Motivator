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
  const audioCtxRef = useRef<AudioContext | null>(null);

  const unlockAudio = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.0001;
      osc.start();
      osc.stop(ctx.currentTime + 0.01);

      return ctx;
    } catch {
      return null;
    }
  }, []);

  const playAlarm = useCallback(() => {
    try {
      const ctx = unlockAudio();
      if (!ctx) return;

      const start = ctx.currentTime;
      const pattern = [0, 0.45, 0.9, 1.35, 1.8, 2.25];

      pattern.forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.value = 520;
        osc.type = 'sine';

        const t = start + offset;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

        osc.start(t);
        osc.stop(t + 0.3);
      });

    } catch { /* AudioContext not available */ }
  }, [unlockAudio]);

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
    unlockAudio();
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
  }, [done, reset, stop, playAlarm, unlockAudio]);

  useEffect(() => { return () => stop(); }, [stop]);

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
      <button
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
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

      {open && (
        <div
          className="fixed right-3 bottom-2 sm:bottom-5 sm:right-4 z-50 bg-white rounded-2xl shadow-2xl border border-stone-100 p-4"
          style={{ width: 220, touchAction: 'manipulation' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Timer</span>
            <button
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
              className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 text-base leading-none"
              style={{ touchAction: 'manipulation' }}
            >×</button>
          </div>

          <div className="flex gap-1.5 mb-4">
            {PRESETS.map(s => (
              <button
                key={s}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); selectPreset(s); }}
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

          <div className="flex gap-2">
            <button
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); running ? stop() : start(); }}
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
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); reset(); }}
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
