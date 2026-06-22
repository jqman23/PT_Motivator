'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PRESETS = [30, 45, 60];
const STRETCH_SECONDS = 60;
const SWITCH_SECONDS = 15;
const BREAK_SECONDS = 30;
const LEAD_IN_SECONDS = 10;
const TIMER_STORAGE_KEY = 'pt-quick-timer-state';

type TimerStep = {
  seconds: number;
  cueAfter: string;
  kind: 'stretch' | 'switch' | 'break';
  countdownToStretch?: boolean;
};
type Mode = 'timer' | 'stopwatch';
type SequenceKey = 'one' | 'two' | 'three' | 'single';

type StoredTimerState = {
  mode: Mode;
  duration: number;
  remaining: number;
  elapsed: number;
  running: boolean;
  done: boolean;
  bellOn: boolean;
  cue: string;
  sequenceActive: boolean;
  sequenceIndex: number;
  sequenceName: string;
  sequenceKey: SequenceKey;
  endAt: number | null;
  savedAt: number;
};

type SequenceOption = {
  name: '1 set' | '2 sets' | '3 sets';
  key: Exclude<SequenceKey, 'single'>;
  steps: TimerStep[];
  pattern: string;
};

function buildSetSequence(setCount: number): TimerStep[] {
  const steps: TimerStep[] = [];
  for (let set = 1; set <= setCount; set += 1) {
    steps.push({ seconds: STRETCH_SECONDS, cueAfter: 'Switch', kind: 'stretch' });
    steps.push({ seconds: SWITCH_SECONDS, cueAfter: 'Start', kind: 'switch', countdownToStretch: true });
    steps.push({ seconds: STRETCH_SECONDS, cueAfter: set === setCount ? 'End' : '30 second break', kind: 'stretch' });
    if (set < setCount) steps.push({ seconds: BREAK_SECONDS, cueAfter: 'One minute starting', kind: 'break', countdownToStretch: true });
  }
  return steps;
}

const ONE_SET_SEQUENCE = buildSetSequence(1);
const TWO_SET_SEQUENCE = buildSetSequence(2);
const THREE_SET_SEQUENCE = buildSetSequence(3);

const SEQUENCE_OPTIONS: SequenceOption[] = [
  { name: '1 set', key: 'one', steps: ONE_SET_SEQUENCE, pattern: '10, 60, 15, 60' },
  { name: '2 sets', key: 'two', steps: TWO_SET_SEQUENCE, pattern: '10, 60, 15, 60, 30, 60, 15, 60' },
  { name: '3 sets', key: 'three', steps: THREE_SET_SEQUENCE, pattern: '10, 60, 15, 60, 30, 60, 15, 60, 30, 60, 15, 60' },
];

function sequenceForKey(key: SequenceKey) {
  if (key === 'one') return ONE_SET_SEQUENCE;
  if (key === 'three') return THREE_SET_SEQUENCE;
  return TWO_SET_SEQUENCE;
}

function keyForSequenceName(name: string): Exclude<SequenceKey, 'single'> {
  if (name === '1 set') return 'one';
  if (name === '3 sets') return 'three';
  return 'two';
}

function normalizeStoredSequenceName(name?: string, key?: SequenceKey) {
  if (name === '1 set' && key === 'single') return '2 sets';
  if (name === '1 set' || name === '2 sets' || name === '3 sets') return name;
  return '2 sets';
}

function segmentLabel(step?: TimerStep) {
  if (!step) return '';
  if (step.kind === 'switch') return 'Switch · 15 sec';
  if (step.kind === 'break') return 'Break · 30 sec';
  return 'Stretch · 1 min';
}

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
  const [sequenceName, setSequenceName] = useState('2 sets');
  const [activeSequence, setActiveSequence] = useState<TimerStep[]>(TWO_SET_SEQUENCE);
  const [cue, setCue] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const sequenceIndexRef = useRef(0);
  const activeSequenceRef = useRef<TimerStep[]>(TWO_SET_SEQUENCE);
  const endAtRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const modeRef = useRef<Mode>('timer');
  const sequenceActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastCountdownSecondRef = useRef<number | null>(null);

  const persistTimer = (patch: Partial<StoredTimerState> = {}) => {
    if (typeof window === 'undefined') return;
    const next: StoredTimerState = {
      mode,
      duration,
      remaining,
      elapsed,
      running,
      done,
      bellOn,
      cue,
      sequenceActive,
      sequenceIndex: sequenceIndexRef.current,
      sequenceName,
      sequenceKey: keyForSequenceName(sequenceName),
      endAt: endAtRef.current,
      savedAt: Date.now(),
      ...patch,
    };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(next));
  };

  const requestNotificationAccess = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
  };

  const showNotification = (message: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try { new Notification('PT timer', { body: message, silent: false }); } catch { /* ignore */ }
  };

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
        : normalized.includes('start')
          ? [740, 880]
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

  const playCountdownBeep = async (count: number) => {
    if (!bellOn) return;
    const ctx = await unlockAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(count === 1 ? 1320 : 1040, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(count === 1 ? 0.2 : 0.13, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  };

  const speakCue = (message: string) => {
    if (!bellOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  };

  const playCue = (message: string) => {
    lastCountdownSecondRef.current = null;
    setCue(message);
    if (!bellOn) return;
    void playBeep(message);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(message.toLowerCase().includes('end') ? [120, 60, 120] : 120);
    speakCue(message);
    showNotification(message);
  };

  const isCountdownToStretchSegment = () => {
    if (!sequenceActiveRef.current) return false;
    if (sequenceIndexRef.current < 0) return true;
    return !!activeSequenceRef.current[sequenceIndexRef.current]?.countdownToStretch;
  };

  const maybeCountdownBeep = (secondsLeft: number) => {
    if (!runningRef.current || !isCountdownToStretchSegment()) return;
    if (secondsLeft < 1 || secondsLeft > 5) return;
    if (lastCountdownSecondRef.current === secondsLeft) return;
    lastCountdownSecondRef.current = secondsLeft;
    void playCountdownBeep(secondsLeft);
  };

  const stopTimer = () => {
    setRunning(false);
    runningRef.current = false;
  };

  const resolveSequenceAt = (now: number) => {
    const steps = activeSequenceRef.current;
    let index = sequenceIndexRef.current;
    let endAt = endAtRef.current ?? now;
    let lastCue = '';
    let nextDuration = duration;

    while (endAt <= now) {
      lastCountdownSecondRef.current = null;
      if (index < 0) {
        lastCue = 'Start';
        index = 0;
        nextDuration = steps[0].seconds;
        endAt += nextDuration * 1000;
      } else {
        const currentStep = steps[index];
        lastCue = currentStep.cueAfter;
        const nextIndex = index + 1;
        if (nextIndex >= steps.length) return { done: true, lastCue };
        index = nextIndex;
        nextDuration = steps[index].seconds;
        endAt += nextDuration * 1000;
      }
    }

    return {
      done: false,
      index,
      endAt,
      remaining: Math.max(1, Math.ceil((endAt - now) / 1000)),
      duration: nextDuration,
      lastCue,
    };
  };

  const finishTimer = (message = 'Done') => {
    stopTimer();
    endAtRef.current = null;
    setRemaining(0);
    setDone(true);
    setSequenceActive(false);
    sequenceActiveRef.current = false;
    playCue(message);
    persistTimer({ running: false, done: true, remaining: 0, sequenceActive: false, endAt: null, cue: message });
  };

  const syncTimerFromClock = (playMissedCue = true) => {
    if (modeRef.current !== 'timer' || !runningRef.current || !endAtRef.current) return;
    const now = Date.now();

    if (endAtRef.current > now) {
      const nextRemaining = Math.max(1, Math.ceil((endAtRef.current - now) / 1000));
      setRemaining(nextRemaining);
      maybeCountdownBeep(nextRemaining);
      return;
    }

    if (!sequenceActiveRef.current) {
      finishTimer('Done');
      return;
    }

    const resolved = resolveSequenceAt(now);
    if (resolved.done) {
      finishTimer(resolved.lastCue || 'End');
      return;
    }

    sequenceIndexRef.current = resolved.index;
    endAtRef.current = resolved.endAt;
    setSequenceIndex(resolved.index);
    setDuration(resolved.duration);
    setRemaining(resolved.remaining);
    if (playMissedCue && resolved.lastCue) playCue(resolved.lastCue);
    maybeCountdownBeep(resolved.remaining);
    persistTimer({
      running: true,
      done: false,
      duration: resolved.duration,
      remaining: resolved.remaining,
      sequenceIndex: resolved.index,
      endAt: resolved.endAt,
      cue: resolved.lastCue || cue,
    });
  };

  const resetTimer = (nextDuration = duration) => {
    stopTimer();
    endAtRef.current = null;
    lastCountdownSecondRef.current = null;
    setDone(false);
    setSequenceActive(false);
    sequenceActiveRef.current = false;
    setSequenceIndex(0);
    sequenceIndexRef.current = 0;
    setCue('');
    setRemaining(nextDuration);
    persistTimer({ running: false, done: false, sequenceActive: false, sequenceIndex: 0, endAt: null, remaining: nextDuration, duration: nextDuration, cue: '' });
  };

  const resetStopwatch = () => {
    stopTimer();
    endAtRef.current = null;
    lastCountdownSecondRef.current = null;
    setDone(false);
    setSequenceActive(false);
    sequenceActiveRef.current = false;
    setSequenceIndex(0);
    sequenceIndexRef.current = 0;
    setCue('');
    setElapsed(0);
    persistTimer({ mode: 'stopwatch', running: false, done: false, elapsed: 0, sequenceActive: false, endAt: null, cue: '' });
  };

  const startCountdown = async () => {
    await unlockAudio();
    await requestNotificationAccess();
    if (done) {
      resetTimer();
      return;
    }

    const startSeconds = Math.max(1, remaining || duration);
    const endAt = Date.now() + startSeconds * 1000;
    endAtRef.current = endAt;
    modeRef.current = 'timer';
    runningRef.current = true;
    setMode('timer');
    setRunning(true);
    setDone(false);
    lastCountdownSecondRef.current = null;
    if (sequenceActive && sequenceIndexRef.current < 0) playCue('Start in 10');
    persistTimer({ mode: 'timer', running: true, done: false, remaining: startSeconds, duration, sequenceActive, sequenceIndex: sequenceIndexRef.current, sequenceName, sequenceKey: keyForSequenceName(sequenceName), endAt });
  };

  const startStopwatch = async () => {
    await unlockAudio();
    stopTimer();
    endAtRef.current = null;
    modeRef.current = 'stopwatch';
    setMode('stopwatch');
    setDone(false);
    setSequenceActive(false);
    sequenceActiveRef.current = false;
    setCue('');
    runningRef.current = true;
    setRunning(true);
    persistTimer({ mode: 'stopwatch', running: true, done: false, sequenceActive: false, endAt: null });
  };

  const startSequencePreset = async (option: SequenceOption) => {
    await unlockAudio();
    await requestNotificationAccess();
    stopTimer();
    endAtRef.current = null;
    lastCountdownSecondRef.current = null;
    activeSequenceRef.current = option.steps;
    setActiveSequence(option.steps);
    setSequenceName(option.name);
    setMode('timer');
    modeRef.current = 'timer';
    setDone(false);
    setSequenceActive(true);
    sequenceActiveRef.current = true;
    setSequenceIndex(-1);
    sequenceIndexRef.current = -1;
    setDuration(LEAD_IN_SECONDS);
    setRemaining(LEAD_IN_SECONDS);
    setCue(`${option.name} ready · ${option.pattern}`);
    persistTimer({ mode: 'timer', running: false, done: false, duration: LEAD_IN_SECONDS, remaining: LEAD_IN_SECONDS, sequenceActive: true, sequenceIndex: -1, sequenceName: option.name, sequenceKey: option.key, endAt: null, cue: `${option.name} ready · ${option.pattern}` });
  };

  const testSound = async () => {
    await unlockAudio();
    await requestNotificationAccess();
    playCue('Sound test');
  };

  const start = () => mode === 'timer' ? void startCountdown() : void startStopwatch();
  const reset = () => mode === 'timer' ? resetTimer() : resetStopwatch();

  const restoreStoredTimer = () => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as StoredTimerState;
      const storedName = normalizeStoredSequenceName(stored.sequenceName, stored.sequenceKey);
      const storedKey = keyForSequenceName(storedName);
      const steps = sequenceForKey(storedKey);
      activeSequenceRef.current = steps;
      endAtRef.current = stored.endAt ?? null;
      sequenceIndexRef.current = stored.sequenceIndex ?? 0;
      sequenceActiveRef.current = !!stored.sequenceActive;
      runningRef.current = !!stored.running;
      modeRef.current = stored.mode ?? 'timer';
      setActiveSequence(steps);
      setMode(stored.mode ?? 'timer');
      setDuration(stored.duration || 30);
      setRemaining(stored.remaining || stored.duration || 30);
      setElapsed(stored.elapsed || 0);
      setRunning(!!stored.running);
      setDone(!!stored.done);
      setBellOn(stored.bellOn !== false);
      setSequenceActive(!!stored.sequenceActive);
      setSequenceIndex(stored.sequenceIndex ?? 0);
      setSequenceName(storedName);
      setCue(stored.cue || '');
      window.setTimeout(() => syncTimerFromClock(true), 0);
    } catch {
      localStorage.removeItem(TIMER_STORAGE_KEY);
    }
  };

  useEffect(() => {
    setMounted(true);
    restoreStoredTimer();
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (modeRef.current === 'timer') syncTimerFromClock(true);
      else setElapsed(prev => {
        const next = prev + 1;
        persistTimer({ mode: 'stopwatch', elapsed: next, running: true, endAt: null });
        return next;
      });
    }, mode === 'timer' ? 350 : 1000);
    return () => window.clearInterval(id);
  }, [running, mode, sequenceActive, sequenceName]);

  useEffect(() => {
    const sync = () => syncTimerFromClock(true);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

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

  const pickPreset = async (seconds: number) => {
    await unlockAudio();
    stopTimer();
    endAtRef.current = null;
    setMode('timer');
    modeRef.current = 'timer';
    setDuration(seconds);
    setSequenceActive(false);
    sequenceActiveRef.current = false;
    setDone(false);
    setRemaining(seconds);
    setCue('');
    persistTimer({ mode: 'timer', duration: seconds, remaining: seconds, running: false, done: false, sequenceActive: false, endAt: null, cue: '' });
  };

  const applyCustomMinutes = async () => {
    await unlockAudio();
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const seconds = Math.max(1, Math.round(minutes * 60));
    setMode('timer');
    modeRef.current = 'timer';
    setDuration(seconds);
    resetTimer(seconds);
  };

  const switchMode = (next: Mode) => {
    stopTimer();
    endAtRef.current = null;
    setDone(false);
    setSequenceActive(false);
    sequenceActiveRef.current = false;
    setSequenceIndex(0);
    sequenceIndexRef.current = 0;
    setCue('');
    setMode(next);
    modeRef.current = next;
    persistTimer({ mode: next, running: false, done: false, sequenceActive: false, sequenceIndex: 0, endAt: null, cue: '' });
  };

  const pauseTimer = () => {
    const pausedRemaining = mode === 'timer' && endAtRef.current ? Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000)) : remaining;
    stopTimer();
    endAtRef.current = null;
    setRemaining(pausedRemaining);
    persistTimer({ running: false, endAt: null, remaining: pausedRemaining });
  };

  const currentSegment = sequenceActive && sequenceIndex >= 0 ? activeSequence[sequenceIndex] : undefined;
  const shownSeconds = mode === 'timer' ? remaining : elapsed;
  const mins = Math.floor(shownSeconds / 60);
  const secs = shownSeconds % 60;
  const pct = mode === 'timer' ? (duration ? remaining / duration : 0) : ((elapsed % 60) / 60);
  const circumference = 2 * Math.PI * 22;
  const dashOffset = circumference * (1 - pct);
  const sequenceLabel = sequenceActive ? (sequenceIndex < 0 ? 'Start in 10' : `${sequenceName} · ${segmentLabel(currentSegment)}`) : '';

  const sequenceButtonStyle = (name: string) => ({
    padding: '9px 10px',
    background: sequenceActive && sequenceName === name ? '#E4ECE6' : '#f5f5f4',
    color: sequenceActive && sequenceName === name ? '#476653' : '#57534e',
    border: sequenceActive && sequenceName === name ? '1px solid #cfded3' : '1px solid transparent',
  });

  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed right-3 bottom-3 sm:right-4 sm:bottom-5 z-[9999] bg-white rounded-2xl shadow-2xl border border-stone-100 p-4"
      style={{ width: 280, touchAction: 'manipulation' }}
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
              <button key={seconds} onClick={event => { event.stopPropagation(); void pickPreset(seconds); }} className="flex-1 rounded-lg text-xs font-bold transition-colors" style={{ padding: '8px 0', background: duration === seconds && !sequenceActive && !running && !done ? '#D9A94B' : '#f5f5f4', color: duration === seconds && !sequenceActive && !running && !done ? '#fff' : '#57534e' }}>{seconds}s</button>
            ))}
          </div>

          <div className="space-y-1.5 mb-2">
            {SEQUENCE_OPTIONS.map(option => (
              <button
                key={option.name}
                onClick={event => { event.stopPropagation(); void startSequencePreset(option); }}
                className="w-full rounded-lg text-left transition-colors"
                style={sequenceButtonStyle(option.name)}
              >
                <span className="block text-xs font-bold">{option.name}</span>
                <span className="block text-[10px] leading-snug opacity-75">{option.pattern}</span>
              </button>
            ))}
          </div>
          <p className="mb-3 text-[10px] text-center text-stone-400">1 set = 10 sec lead-in, 1 min side A, 15 sec switch, 1 min side B</p>

          <div className="flex gap-1.5 mb-3">
            <input value={customMinutes} onChange={event => setCustomMinutes(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void applyCustomMinutes(); }} type="number" min="0.1" step="0.5" className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 text-xs font-semibold text-stone-700 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} aria-label="Custom minutes" />
            <button onClick={event => { event.stopPropagation(); void applyCustomMinutes(); }} className="rounded-lg px-2.5 text-xs font-bold text-white" style={{ background: '#7E9B86' }}>min</button>
            <button onClick={event => { event.stopPropagation(); void unlockAudio(); void requestNotificationAccess(); setBellOn(value => !value); }} className="rounded-lg px-2.5 text-xs font-bold" style={{ background: bellOn ? '#E4ECE6' : '#f5f5f4', color: bellOn ? '#476653' : '#a8a29e' }} title="Sound on/off">{bellOn ? '🔔' : '🔕'}</button>
            <button onClick={event => { event.stopPropagation(); void testSound(); }} className="rounded-lg px-2 text-xs font-bold" style={{ background: '#f5f5f4', color: '#57534e' }} title="Test sound">Test</button>
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
          {running && isCountdownToStretchSegment() && remaining <= 5 && <p className="text-[11px] font-bold mt-0.5">Stretch starts in {remaining}</p>}
          {running && <p className="text-[10px] font-semibold mt-0.5 opacity-70">Persists with app switching when iOS allows web timers/notifications.</p>}
        </div>
      )}
      {done && mode === 'timer' && <p className="text-center text-xs font-bold mb-3" style={{ color: '#7E9B86' }}>Done! ✓ {bellOn ? '🔔' : '🔕'}</p>}

      <div className="flex gap-2">
        <button onClick={event => { event.stopPropagation(); running ? pauseTimer() : start(); }} className="flex-1 rounded-lg text-xs font-bold transition-colors" style={{ padding: '10px 0', background: running ? '#f5f5f4' : '#D9A94B', color: running ? '#57534e' : '#fff' }}>{running ? 'Pause' : done && mode === 'timer' ? 'Restart' : 'Start'}</button>
        <button onClick={event => { event.stopPropagation(); reset(); }} className="rounded-lg text-xs font-semibold transition-colors" style={{ padding: '10px 12px', background: '#f5f5f4', color: '#78716c' }}>Reset</button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button onClick={event => { event.stopPropagation(); void unlockAudio(); void requestNotificationAccess(); setOpen(current => !current); }} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-sm border flex-shrink-0 ${running ? 'bg-[#D9A94B] border-[#D9A94B] text-white' : done ? 'bg-[#7E9B86] border-[#7E9B86] text-white' : 'bg-[#E4ECE6] border-[#cfded3] text-[#476653]'}`} title="Quick timer" style={{ touchAction: 'manipulation' }}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="10" cy="11" r="7"/><path d="M10 7v4l2.5 2.5"/><path d="M7.5 2.5h5"/><path d="M10 2.5v2"/></svg>
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
