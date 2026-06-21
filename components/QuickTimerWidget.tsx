'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PRESETS = [30, 45, 60];
const PT_SEQUENCE = [
  { seconds: 60, cueAfter: 'Switch' },
  { seconds: 60, cueAfter: '30 second break' },
  { seconds: 30, cueAfter: 'One minute starting' },
  { seconds: 60, cueAfter: 'Switch' },
  { seconds: 60, cueAfter: 'End' },
];

type Mode = 'timer' | 'stopwatch';

export default function QuickTimerWidget() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('timer');
  const [duration, setDuration] = useState(30);
  const [remaining, setRemaining] = useState(30);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('2');
  const [bellOn, setBellOn] = useState(true);
  const [sequenceActive, setSequenceActive] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [cue, setCue] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const sequenceIndexRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => setMounted(true), []);

  const unlockAudio = async () => {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    return audioContextRef.current;
  };

  const playBeep = async (message: string) => {
    if (!bellOn) return;
    const ctx = await unlockAudio();
    if (!ctx) return;
    const normalized = message.toLowerCase();
    const pattern = normalized.includes('end') || normalized.includes('done')
      ? [880, 988, 1175]
      : normalized.includes('break')
        ? [660, 520]
        : [880, 880];

    pattern.forEach((freq, index) => {
      const start = ctx.currentTime + index * 0.18;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    });
  };

  const speakCue = (message: string) => {
    if (!bellOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  };

  const playCue = (message: string) => {
    setCue(message);
    if (!bellOn) return;
    void playBeep(message);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(message.toLowerCase().includes('end') ? [120, 60, 120] : 120);
    speakCue(message);
  };

  const stopTimer = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  };

  const resetTimer = (nextDuration = duration) => {
    stopTimer();
    setDone(false);
    setSequenceActive(false);
    setSequenceIndex(0);
    sequenceIndexRef.current = 0;
    setCue('');
    setRemaining(nextDuration);
  };

  const resetStopwatch = () => {
    stopTimer();
    setDone(false);
    setSequenceActive(false);
    setSequenceIndex(0);
    sequenceIndexRef.current = 0;
    setCue('');
    setElapsed(0);
  };

  const finishTimer = () => {
    stopTimer();
    setDone(true);
    setSequenceActive(false);
    playCue('Done');
  };

  const advanceSequence = () => {
    const currentIndex = sequenceIndexRef.current;
    const currentStep = PT_SEQUENCE[currentIndex];
    playCue(currentStep.cueAfter);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= PT_SEQUENCE.length) {
      stopTimer();
      setDone(true);
      setSequenceActive(false);
      return 0;
    }

    sequenceIndexRef.current = nextIndex;
    setSequenceIndex(nextIndex);
    setDuration(PT_SEQUENCE[nextIndex].seconds);
    return PT_SEQUENCE[nextIndex].seconds;
  };

  const startCountdown = () => {
    void unlockAudio();
    if (done) {
      resetTimer();
      return;
    }
    stopTimer();
    setRunning(true);
    intervalRef.current = window.setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (sequenceActive) return advanceSequence();
          finishTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startStopwatch = () => {
    void unlockAudio();
    stopTimer();
    setDone(false);
    setSequenceActive(false);
    setCue('');
    setRunning(true);
    intervalRef.current = window.setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  };

  const startSequencePreset = () => {
    void unlockAudio();
    stopTimer();
    setMode('timer');
    setDone(false);
    setSequenceActive(true);
    setSequenceIndex(0);
    sequenceIndexRef.current = 0;
    setDuration(PT_SEQUENCE[0].seconds);
    setRemaining(PT_SEQUENCE[0].seconds);
    setCue('PT sequence ready');
  };

  const start = () => mode === 'timer' ? startCountdown() : startStopwatch();
  const reset = () => mode === 'timer' ? resetTimer() : resetStopwatch();

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
    void unlockAudio();
    setMode('timer');
    setDuration(seconds);
    resetTimer(seconds);
  };

  const applyCustomMinutes = () => {
    void unlockAudio();
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const seconds = Math.max(1, Math.round(minutes * 60));
    setMode('timer');
    setDuration(seconds);
    resetTimer(seconds);
  };

  const switchMode = (next: Mode) => {
    stopTimer();
    setDone(false);
    setSequenceActive(false);
    setSequenceIndex(0);
    sequenceIndexRef.current = 0;
    setCue('');
    setMode(next);
  };

  const shownSeconds = mode === 'timer' ? remaining : elapsed;
  const mins = Math.floor(shownSeconds / 60);
  const secs = shownSeconds % 60;
  const pct = mode === 'timer' ? (duration ? remaining / duration : 0) : ((elapsed % 60) / 60);
  const circumference = 2 * Math.PI * 22;
  const dashOffset = circumference * (1 - pct);
  const sequenceLabel = sequenceActive ? `Step ${sequenceIndex + 1}/${PT_SEQUENCE.length}` : '';

  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed right-3 bottom-3 sm:right-4 sm:bottom-5 z-[9999] bg-white rounded-2xl shadow-2xl border border-stone-100 p-4"
      style={{ width: 250, touchAction: 'manipulation' }}
      onClick={event => event.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Timer</span>
        <button onClick={event => { event.stopPropagation(); setOpen(false); }} className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 text-base leading-none">×</button>
      </div>

      <div className="flex gap-1.5 mb-3 rounded-xl bg-stone-100 p-1">
        <button onClick={event => { event.stopPropagation(); switchMode('timer'); }} className="flex-1 rounded-lg py-1.5 text-xs font-bold" style={{ background: mode === 'timer' ? 'white' : 'transparent', color: mode === 'timer' ? '#57534e' : '#a8a29e' }}>Timer</button>
        <button onClick={event => { event.stopPropagation(); switchMode('stopwatch'); }} className="flex-1 rounded-lg py-1.5 text-xs font-bold" style={{ background: mode === 'stopwatch' ? 'white' : 'transparent', color: mode === 'stopwatch' ? '#57534e' : '#a8a29e' }}>Stopwatch</button>
      </div>

      {mode === 'timer' && (
        <>
          <div className="flex gap-1.5 mb-2">
            {PRESETS.map(seconds => (
              <button key={seconds} onClick={event => { event.stopPropagation(); pickPreset(seconds); }} className="flex-1 rounded-lg text-xs font-bold transition-colors" style={{ padding: '8px 0', background: duration === seconds && !sequenceActive && !running && !done ? '#D9A94B' : '#f5f5f4', color: duration === seconds && !sequenceActive && !running && !done ? '#fff' : '#57534e' }}>{seconds}s</button>
            ))}
          </div>

          <button
            onClick={event => { event.stopPropagation(); startSequencePreset(); }}
            className="mb-3 w-full rounded-lg text-xs font-bold transition-colors"
            style={{ padding: '8px 0', background: sequenceActive ? '#E4ECE6' : '#f5f5f4', color: sequenceActive ? '#476653' : '#57534e', border: sequenceActive ? '1px solid #cfded3' : '1px solid transparent' }}
          >
            1m / switch / break preset
          </button>

          <div className="flex gap-1.5 mb-3">
            <input value={customMinutes} onChange={event => setCustomMinutes(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') applyCustomMinutes(); }} type="number" min="0.1" step="0.5" className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 text-xs font-semibold text-stone-700 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} aria-label="Custom minutes" />
            <button onClick={event => { event.stopPropagation(); applyCustomMinutes(); }} className="rounded-lg px-2.5 text-xs font-bold text-white" style={{ background: '#7E9B86' }}>min</button>
            <button onClick={event => { event.stopPropagation(); void unlockAudio(); setBellOn(value => !value); }} className="rounded-lg px-2.5 text-xs font-bold" style={{ background: bellOn ? '#E4ECE6' : '#f5f5f4', color: bellOn ? '#476653' : '#a8a29e' }} title="Sound on/off">{bellOn ? '🔔' : '🔕'}</button>
          </div>
        </>
      )}

      <div className="flex items-center justify-center mb-3">
        <div className="relative" style={{ width: 72, height: 72 }}>
          <svg viewBox="0 0 48 48" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="24" cy="24" r="22" fill="none" stroke="#E7E5E4" strokeWidth="3.5" />
            <circle cx="24" cy="24" r="22" fill="none" stroke={done ? '#7E9B86' : running ? '#D9A94B' : sequenceActive ? '#7E9B86' : '#C17B4F'} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.9s linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', fontFamily: 'inherit' }}>{mins}:{String(secs).padStart(2, '0')}</span>
          </div>
        </div>
      </div>

      {(cue || sequenceLabel) && mode === 'timer' && (
        <div className="text-center mb-3 rounded-xl px-2 py-1.5" style={{ background: '#E4ECE6', color: '#476653' }}>
          {sequenceLabel && <p className="text-[10px] font-bold uppercase tracking-wider">{sequenceLabel}</p>}
          {cue && <p className="text-xs font-bold">{cue}</p>}
        </div>
      )}
      {done && mode === 'timer' && <p className="text-center text-xs font-bold mb-3" style={{ color: '#7E9B86' }}>Done! ✓ {bellOn ? '🔔' : '🔕'}</p>}

      <div className="flex gap-2">
        <button onClick={event => { event.stopPropagation(); running ? stopTimer() : start(); }} className="flex-1 rounded-lg text-xs font-bold transition-colors" style={{ padding: '10px 0', background: running ? '#f5f5f4' : '#D9A94B', color: running ? '#57534e' : '#fff' }}>{running ? 'Pause' : done && mode === 'timer' ? 'Restart' : 'Start'}</button>
        <button onClick={event => { event.stopPropagation(); reset(); }} className="rounded-lg text-xs font-semibold transition-colors" style={{ padding: '10px 12px', background: '#f5f5f4', color: '#78716c' }}>Reset</button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button onClick={event => { event.stopPropagation(); void unlockAudio(); setOpen(current => !current); }} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-sm border flex-shrink-0 ${running ? 'bg-[#D9A94B] border-[#D9A94B] text-white' : done ? 'bg-[#7E9B86] border-[#7E9B86] text-white' : 'bg-[#E4ECE6] border-[#cfded3] text-[#476653]'}`} title="Quick timer" style={{ touchAction: 'manipulation' }}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="10" cy="11" r="7"/><path d="M10 7v4l2.5 2.5"/><path d="M7.5 2.5h5"/><path d="M10 2.5v2"/></svg>
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
