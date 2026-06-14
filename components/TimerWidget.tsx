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

  const playAlarm = useCallback(() => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
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
    if (done) {
      reset();
      return;
    }
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
    <div className="relative">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-sm border ${
          running ? 'bg-[#D9A94B] border-[#D9A94B] text-white' :
          done ? 'bg-[#7E9B86] border-[#7E9B86] text-white' :
          'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
        }`}
        title="Quick timer"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <circle cx="10" cy="11" r="7"/>
          <path d="M10 7v4l2.5 2.5"/>
          <path d="M7.5 2.5h5"/>
          <path d="M10 2.5v2"/>
        </svg>
      </button>

      {/* Popup */}
      {open && (
        <div className="absolute right-0 top-11 z-40 bg-white rounded-2xl shadow-2xl border border-stone-100 p-4 w-52" style={{ minWidth: 208 }}>
          {/* Preset buttons */}
          <div className="flex gap-1.5 mb-4">
            {PRESETS.map(s => (
              <button
                key={s}
                onClick={() => selectPreset(s)}
                className={`flex-1 py-1 rounded-lg text-xs font-bold transition-colors ${
                  duration === s && !running && !done
                    ? 'bg-[#D9A94B] text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {s}s
              </button>
            ))}
          </div>

          {/* Ring + time display */}
          <div className="flex items-center justify-center mb-4">
            <div className="relative w-[60px] h-[60px]">
              <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
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
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-stone-800 leading-none">
                  {mins > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : `${secs}s`}
                </span>
              </div>
            </div>
          </div>

          {done && (
            <p className="text-center text-xs font-bold text-[#7E9B86] mb-3">Done!</p>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            <button
              onClick={running ? stop : start}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                running
                  ? 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  : 'bg-[#D9A94B] text-white hover:bg-[#c89a3f]'
              }`}
            >
              {running ? 'Pause' : done ? 'Restart' : 'Start'}
            </button>
            <button
              onClick={() => reset()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
