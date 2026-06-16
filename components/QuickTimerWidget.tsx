'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PRESETS = [30, 45, 60];

export default function QuickTimerWidget() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(30);
  const [remaining, setRemaining] = useState(30);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setMounted(true), []);

  const stopTimer = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  };

  const resetTimer = (nextDuration = duration) => {
    stopTimer();
    setDone(false);
    setRemaining(nextDuration);
  };

  const startTimer = () => {
    if (done) {
      resetTimer();
      return;
    }
    stopTimer();
    setRunning(true);
    intervalRef.current = window.setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          stopTimer();
          setDone(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => stopTimer(), []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 0);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const pickPreset = (seconds: number) => {
    setDuration(seconds);
    resetTimer(seconds);
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = duration ? remaining / duration : 0;
  const circumference = 2 * Math.PI * 22;
  const dashOffset = circumference * (1 - pct);

  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed right-3 bottom-3 sm:right-4 sm:bottom-5 z-[9999] bg-white rounded-2xl shadow-2xl border border-stone-100 p-4"
      style={{ width: 220, touchAction: 'manipulation' }}
      onClick={event => event.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Timer</span>
        <button onClick={event => { event.stopPropagation(); setOpen(false); }} className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 text-base leading-none">×</button>
      </div>

      <div className="flex gap-1.5 mb-4">
        {PRESETS.map(seconds => (
          <button
            key={seconds}
            onClick={event => { event.stopPropagation(); pickPreset(seconds); }}
            className="flex-1 rounded-lg text-xs font-bold transition-colors"
            style={{ padding: '8px 0', background: duration === seconds && !running && !done ? '#D9A94B' : '#f5f5f4', color: duration === seconds && !running && !done ? '#fff' : '#57534e' }}
          >
            {seconds}s
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center mb-4">
        <div className="relative" style={{ width: 72, height: 72 }}>
          <svg viewBox="0 0 48 48" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="24" cy="24" r="22" fill="none" stroke="#E7E5E4" strokeWidth="3.5" />
            <circle cx="24" cy="24" r="22" fill="none" stroke={done ? '#7E9B86' : running ? '#D9A94B' : '#C17B4F'} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.9s linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', fontFamily: 'inherit' }}>{mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`}</span>
          </div>
        </div>
      </div>

      {done && <p className="text-center text-xs font-bold mb-3" style={{ color: '#7E9B86' }}>Done! ✓</p>}

      <div className="flex gap-2">
        <button onClick={event => { event.stopPropagation(); running ? stopTimer() : startTimer(); }} className="flex-1 rounded-lg text-xs font-bold transition-colors" style={{ padding: '10px 0', background: running ? '#f5f5f4' : '#D9A94B', color: running ? '#57534e' : '#fff' }}>{running ? 'Pause' : done ? 'Restart' : 'Start'}</button>
        <button onClick={event => { event.stopPropagation(); resetTimer(); }} className="rounded-lg text-xs font-semibold transition-colors" style={{ padding: '10px 12px', background: '#f5f5f4', color: '#78716c' }}>Reset</button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={event => { event.stopPropagation(); setOpen(current => !current); }}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-sm border flex-shrink-0 ${running ? 'bg-[#D9A94B] border-[#D9A94B] text-white' : done ? 'bg-[#7E9B86] border-[#7E9B86] text-white' : 'bg-white border-stone-200 text-stone-500'}`}
        title="Quick timer"
        style={{ touchAction: 'manipulation' }}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="10" cy="11" r="7"/><path d="M10 7v4l2.5 2.5"/><path d="M7.5 2.5h5"/><path d="M10 2.5v2"/></svg>
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
