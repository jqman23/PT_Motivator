'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PRESETS = [30, 45, 60];
const LEAD_IN_SECONDS = 10;
const SWITCH_SECONDS = 15;
const BREAK_SECONDS = 30;
const TIMER_STORAGE_KEY = 'pt-quick-timer-state';

type Mode = 'timer' | 'stopwatch';
type SequenceKey = 'one60' | 'two60' | 'three60' | 'one30' | 'two30' | 'three30';
type StepKind = 'stretch' | 'switch' | 'break';

type TimerStep = {
  seconds: number;
  cueAfter: string;
  kind: StepKind;
  countdownToStretch?: boolean;
};

type SequenceOption = {
  key: SequenceKey;
  label: '1 set' | '2 sets' | '3 sets';
  group: '60 sec holds' | '30 sec holds';
  holdSeconds: 30 | 60;
  steps: TimerStep[];
};

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
  sequenceKey: SequenceKey | null;
  endAt: number | null;
};

type SequenceResolution =
  | { done: true; lastCue: string }
  | { done: false; index: number; endAt: number; remaining: number; duration: number; lastCue: string };

function startCue(holdSeconds: 30 | 60) {
  return holdSeconds === 60 ? 'One minute starting' : '30 seconds starting';
}

function buildSequence(setCount: number, holdSeconds: 30 | 60): TimerStep[] {
  const steps: TimerStep[] = [];
  for (let set = 1; set <= setCount; set += 1) {
    steps.push({ seconds: holdSeconds, cueAfter: 'Switch', kind: 'stretch' });
    steps.push({ seconds: SWITCH_SECONDS, cueAfter: 'Start', kind: 'switch', countdownToStretch: true });
    steps.push({ seconds: holdSeconds, cueAfter: set === setCount ? 'End' : '30 second break', kind: 'stretch' });
    if (set < setCount) steps.push({ seconds: BREAK_SECONDS, cueAfter: startCue(holdSeconds), kind: 'break', countdownToStretch: true });
  }
  return steps;
}

const SEQUENCE_OPTIONS: SequenceOption[] = [
  { key: 'one60', label: '1 set', group: '60 sec holds', holdSeconds: 60, steps: buildSequence(1, 60) },
  { key: 'two60', label: '2 sets', group: '60 sec holds', holdSeconds: 60, steps: buildSequence(2, 60) },
  { key: 'three60', label: '3 sets', group: '60 sec holds', holdSeconds: 60, steps: buildSequence(3, 60) },
  { key: 'one30', label: '1 set', group: '30 sec holds', holdSeconds: 30, steps: buildSequence(1, 30) },
  { key: 'two30', label: '2 sets', group: '30 sec holds', holdSeconds: 30, steps: buildSequence(2, 30) },
  { key: 'three30', label: '3 sets', group: '30 sec holds', holdSeconds: 30, steps: buildSequence(3, 30) },
];

const DEFAULT_SEQUENCE = SEQUENCE_OPTIONS[0];

function getSequence(key: SequenceKey | null | undefined) {
  return SEQUENCE_OPTIONS.find(option => option.key === key) ?? DEFAULT_SEQUENCE;
}

function segmentLabel(step?: TimerStep) {
  if (!step) return '';
  if (step.kind === 'switch') return 'Switch · 15 sec';
  if (step.kind === 'break') return 'Break · 30 sec';
  return step.seconds === 60 ? 'Stretch · 1 min' : 'Stretch · 30 sec';
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function groupDisplayLabel(group: SequenceOption['group']) {
  return group === '60 sec holds' ? '60s holds' : '30s holds';
}

function setLabelParts(label: SequenceOption['label']) {
  const count = label.split(' ')[0];
  return { count, noun: count === '1' ? 'set' : 'sets' };
}

function noteForSequence(seq: SequenceOption) {
  const count = seq.label.split(' ')[0];
  return `${count}×${seq.holdSeconds}s ea side`;
}

function getFriendlyVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const preferred = ['samantha', 'ava', 'allison', 'susan', 'victoria', 'karen', 'moira', 'tessa', 'daniel', 'google us english', 'microsoft aria', 'jenny', 'libby', 'zira'];
  return voices.find(voice => preferred.some(name => voice.name.toLowerCase().includes(name)))
    ?? voices.find(voice => voice.lang.toLowerCase().startsWith('en') && voice.localService)
    ?? voices.find(voice => voice.lang.toLowerCase().startsWith('en'))
    ?? null;
}

interface QuickTimerWidgetProps {
  exercises?: Array<{ id: string; name: string }>;
  onSaveNote?: (exerciseId: string, note: string) => void | Promise<void>;
  onOpenNote?: (exerciseId: string) => void;
}

export default function QuickTimerWidget({ exercises, onSaveNote, onOpenNote }: QuickTimerWidgetProps = {}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('timer');
  const [duration, setDuration] = useState(30);
  const [remaining, setRemaining] = useState(30);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [bellOn, setBellOn] = useState(true);
  const [customMinutes, setCustomMinutes] = useState('2');
  const [cue, setCue] = useState('');
  const [sequenceActive, setSequenceActive] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [sequenceKey, setSequenceKey] = useState<SequenceKey | null>(null);

  const [logExerciseId, setLogExerciseId] = useState('');
  const [logNoteText, setLogNoteText] = useState('');
  const [logSaved, setLogSaved] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const bellOnRef = useRef(bellOn);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSequenceRef = useRef<TimerStep[]>(DEFAULT_SEQUENCE.steps);
  const endAtRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>('timer');
  const runningRef = useRef(false);
  const sequenceActiveRef = useRef(false);
  const sequenceIndexRef = useRef(0);
  const sequenceKeyRef = useRef<SequenceKey | null>(null);
  const lastCountdownSecondRef = useRef<number | null>(null);

  useEffect(() => { bellOnRef.current = bellOn; }, [bellOn]);

  const activeSequence = getSequence(sequenceKey);
  const currentStep = sequenceActive && sequenceIndex >= 0 ? activeSequenceRef.current[sequenceIndex] : undefined;
  const shownSeconds = mode === 'timer' ? remaining : elapsed;
  const pct = mode === 'timer' ? (duration ? remaining / duration : 0) : ((elapsed % 60) / 60);
  const circumference = 2 * Math.PI * 22;
  const dashOffset = circumference * (1 - pct);
  const sequenceLabel = sequenceActive
    ? sequenceIndex < 0
      ? 'Start in 10'
      : `${activeSequence.label} · ${activeSequence.holdSeconds}s · ${segmentLabel(currentStep)}`
    : '';

  // Pre-fill log note when timer completes
  useEffect(() => {
    if (!done || sequenceActive) return;
    setLogNoteText(sequenceKey ? noteForSequence(getSequence(sequenceKey)) : `1×${duration}s`);
    setLogSaved(false);
  }, [done, sequenceActive, sequenceKey, duration]);

  // Reset log state when timer resets
  useEffect(() => {
    if (!done) {
      setLogSaved(false);
      setLogExerciseId('');
    }
  }, [done]);

  const persistTimer = (patch: Partial<StoredTimerState> = {}) => {
    if (typeof window === 'undefined') return;
    const state: StoredTimerState = {
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
      sequenceKey: sequenceKeyRef.current,
      endAt: endAtRef.current,
      ...patch,
    };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
  };

  const unlockAudio = async () => {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    return audioContextRef.current;
  };

  const playTone = async (frequency: number, volume = 0.15, length = 0.12) => {
    if (!bellOnRef.current) return;
    const ctx = await unlockAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + length + 0.02);
  };

  const speakCue = (message: string) => {
    if (!bellOnRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    const voice = getFriendlyVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.pitch = 1.04;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  };

  const playDoneDing = () => {
    void playTone(880, 0.16);
    window.setTimeout(() => void playTone(988, 0.16), 170);
    window.setTimeout(() => void playTone(1175, 0.16), 340);
  };

  const playCue = (message: string) => {
    lastCountdownSecondRef.current = null;
    setCue(message);
    if (!bellOnRef.current) return;
    const lower = message.toLowerCase();
    if (lower.includes('end') || lower.includes('done')) playDoneDing();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(lower.includes('end') ? [120, 60, 120] : 80);
    speakCue(message);
  };

  const isCountdownToStretch = () => {
    if (!sequenceActiveRef.current) return false;
    if (sequenceIndexRef.current < 0) return true;
    return !!activeSequenceRef.current[sequenceIndexRef.current]?.countdownToStretch;
  };

  const maybeCountdownBeep = (secondsLeft: number) => {
    if (!runningRef.current || !isCountdownToStretch()) return;
    if (secondsLeft < 1 || secondsLeft > 5) return;
    if (lastCountdownSecondRef.current === secondsLeft) return;
    lastCountdownSecondRef.current = secondsLeft;
    void playTone(secondsLeft === 1 ? 1320 : 1040, secondsLeft === 1 ? 0.2 : 0.13, 0.09);
  };

  const stopTimer = () => {
    setRunning(false);
    runningRef.current = false;
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

  const resolveSequenceAt = (now: number): SequenceResolution => {
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
        nextDuration = steps[0]?.seconds ?? duration;
        endAt += nextDuration * 1000;
      } else {
        const current = steps[index];
        if (!current) return { done: true, lastCue: lastCue || 'End' };
        lastCue = current.cueAfter;
        const nextIndex = index + 1;
        const next = steps[nextIndex];
        if (!next) return { done: true, lastCue };
        index = nextIndex;
        nextDuration = next.seconds;
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
    persistTimer({ mode: 'timer', running: true, done: false, remaining: startSeconds, duration, sequenceActive, sequenceIndex: sequenceIndexRef.current, sequenceKey: sequenceKeyRef.current, endAt });
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
    stopTimer();
    endAtRef.current = null;
    lastCountdownSecondRef.current = null;
    activeSequenceRef.current = option.steps;
    sequenceKeyRef.current = option.key;
    setSequenceKey(option.key);
    setMode('timer');
    modeRef.current = 'timer';
    setDone(false);
    setSequenceActive(true);
    sequenceActiveRef.current = true;
    setSequenceIndex(-1);
    sequenceIndexRef.current = -1;
    setDuration(LEAD_IN_SECONDS);
    setRemaining(LEAD_IN_SECONDS);
    setCue(`${option.label} · ${option.holdSeconds}s ready`);
    persistTimer({ mode: 'timer', running: false, done: false, duration: LEAD_IN_SECONDS, remaining: LEAD_IN_SECONDS, sequenceActive: true, sequenceIndex: -1, sequenceKey: option.key, endAt: null, cue: `${option.label} · ${option.holdSeconds}s ready` });
  };

  const start = () => mode === 'timer' ? void startCountdown() : void startStopwatch();
  const reset = () => mode === 'timer' ? resetTimer() : resetStopwatch();

  const handleLogNote = async () => {
    if (!logExerciseId || !logNoteText || !onSaveNote) return;
    await onSaveNote(logExerciseId, logNoteText);
    setLogSaved(true);
  };

  const restoreStoredTimer = () => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as StoredTimerState;
      // Only restore if the timer was actively running — otherwise start blank
      if (!stored.running) {
        localStorage.removeItem(TIMER_STORAGE_KEY);
        return;
      }
      const option = getSequence(stored.sequenceKey);
      activeSequenceRef.current = option.steps;
      sequenceKeyRef.current = option.key;
      endAtRef.current = stored.endAt ?? null;
      sequenceIndexRef.current = stored.sequenceIndex ?? 0;
      sequenceActiveRef.current = !!stored.sequenceActive;
      runningRef.current = !!stored.running;
      modeRef.current = stored.mode ?? 'timer';
      setSequenceKey(option.key);
      setMode(stored.mode ?? 'timer');
      setDuration(stored.duration || 30);
      setRemaining(stored.remaining || stored.duration || 30);
      setElapsed(stored.elapsed || 0);
      setRunning(!!stored.running);
      setDone(!!stored.done);
      setBellOn(stored.bellOn !== false);
      setSequenceActive(!!stored.sequenceActive);
      setSequenceIndex(stored.sequenceIndex ?? 0);
      setCue(stored.cue || '');
      window.setTimeout(() => syncTimerFromClock(true), 0);
    } catch {
      localStorage.removeItem(TIMER_STORAGE_KEY);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
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
  }, [running, mode, sequenceActive, cue, duration, remaining]);

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
      const target = event.target as Element | null;
      if (target && panelRef.current?.contains(target)) return;
      if (target?.closest('[data-widget-dock-toggle]')) return;
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
    sequenceKeyRef.current = null;
    setMode('timer');
    modeRef.current = 'timer';
    setDuration(seconds);
    setSequenceKey(null);
    setSequenceActive(false);
    sequenceActiveRef.current = false;
    setDone(false);
    setRemaining(seconds);
    setCue('');
    persistTimer({ mode: 'timer', duration: seconds, remaining: seconds, running: false, done: false, sequenceActive: false, sequenceKey: null, endAt: null, cue: '' });
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

  const groupedSequenceOptions = [
    { label: '60 sec holds', options: SEQUENCE_OPTIONS.filter(option => option.group === '60 sec holds') },
    { label: '30 sec holds', options: SEQUENCE_OPTIONS.filter(option => option.group === '30 sec holds') },
  ];

  const showLogSection = done && !sequenceActive && mode === 'timer' && !!onSaveNote && !!(exercises?.length);

  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed right-3 bottom-3 sm:right-4 sm:bottom-5 z-[9999] bg-white rounded-2xl shadow-2xl border border-stone-100 p-4"
      style={{ width: 292, touchAction: 'manipulation' }}
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

          <div className="space-y-2 mb-2">
            {groupedSequenceOptions.map(group => (
              <div key={group.label} className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{groupDisplayLabel(group.label as SequenceOption['group'])}</p>
                <div className="grid grid-cols-3 gap-2">
                  {group.options.map(option => {
                    const label = setLabelParts(option.label);
                    return (
                      <button
                        key={option.key}
                        onClick={event => { event.stopPropagation(); void startSequencePreset(option); }}
                        className="rounded-xl text-center font-bold transition-colors flex flex-col items-center justify-center"
                        style={{
                          minHeight: 46,
                          padding: '7px 4px 6px',
                          background: sequenceActive && sequenceKey === option.key ? '#E4ECE6' : '#f5f5f4',
                          color: sequenceActive && sequenceKey === option.key ? '#476653' : '#57534e',
                          border: sequenceActive && sequenceKey === option.key ? '1px solid #cfded3' : '1px solid transparent',
                        }}
                      >
                        <span className="text-sm leading-none">{label.count}</span>
                        <span className="text-[10px] leading-none mt-1 font-semibold opacity-80">{label.noun}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mb-3 text-[10px] text-center text-stone-400">Set = side A · switch · side B</p>

          <div className="flex gap-1.5 mb-3">
            <input value={customMinutes} onChange={event => setCustomMinutes(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void applyCustomMinutes(); }} type="number" min="0.1" step="0.5" className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 text-xs font-semibold text-stone-700 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} aria-label="Custom minutes" />
            <button onClick={event => { event.stopPropagation(); void applyCustomMinutes(); }} className="rounded-lg px-2.5 text-xs font-bold text-white" style={{ background: '#7E9B86' }}>min</button>
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
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', fontFamily: 'inherit' }}>{formatTime(shownSeconds)}</span>
          </div>
        </div>
      </div>

      {(cue || sequenceLabel) && mode === 'timer' && (
        <div className="text-center mb-3 rounded-xl px-2 py-1.5" style={{ background: '#E4ECE6', color: '#476653' }}>
          {sequenceLabel && <p className="text-[10px] font-bold uppercase tracking-wider">{sequenceLabel}</p>}
          {cue && <p className="text-xs font-bold">{cue}</p>}
          {running && isCountdownToStretch() && remaining <= 5 && <p className="text-[11px] font-bold mt-0.5">Stretch starts in {remaining}</p>}
        </div>
      )}

      {showLogSection && (
        <div className="mb-3 rounded-xl border border-stone-100 bg-stone-50 p-2.5">
          {!logSaved ? (
            <>
              <p className="text-[9px] font-bold uppercase tracking-wider text-stone-400 mb-2">Log to exercise</p>
              <select
                value={logExerciseId}
                onChange={e => setLogExerciseId(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full rounded-lg border border-stone-200 bg-white px-2 mb-1.5"
                style={{ padding: '5px 8px', fontSize: 14, colorScheme: 'light' }}
              >
                <option value="">Choose exercise…</option>
                {exercises!.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
              <div className="flex gap-1.5">
                <input
                  value={logNoteText}
                  onChange={e => setLogNoteText(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2"
                  style={{ padding: '5px 8px', fontSize: 14, colorScheme: 'light' }}
                />
                <button
                  onClick={e => { e.stopPropagation(); void handleLogNote(); }}
                  disabled={!logExerciseId || !logNoteText}
                  className="rounded-lg px-3 text-xs font-bold text-white flex-shrink-0 disabled:opacity-40"
                  style={{ background: '#7E9B86' }}
                >
                  Log
                </button>
              </div>
            </>
          ) : (
            <button onClick={e => { e.stopPropagation(); if (onOpenNote && logExerciseId) { onOpenNote(logExerciseId); } else { setLogSaved(false); } }} className="w-full text-center text-xs font-bold py-0.5 rounded-lg hover:bg-stone-100 transition-colors" style={{ color: '#7E9B86' }}>✓ Note logged · tap to edit</button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={event => { event.stopPropagation(); running ? pauseTimer() : start(); }} className="flex-1 rounded-lg text-xs font-bold transition-colors" style={{ padding: '10px 0', background: running ? '#f5f5f4' : '#D9A94B', color: running ? '#57534e' : '#fff' }}>{running ? 'Pause' : done && mode === 'timer' ? 'Restart' : 'Start'}</button>
        <button onClick={event => { event.stopPropagation(); reset(); }} className="rounded-lg text-xs font-semibold transition-colors" style={{ padding: '10px 12px', background: '#f5f5f4', color: '#78716c' }}>Reset</button>
      </div>
    </div>
  ) : null;

  const labelStyle: React.CSSProperties = { fontSize: '6.5px', lineHeight: 1, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.9 };

  return (
    <>
      <button onClick={event => { event.stopPropagation(); void unlockAudio(); setOpen(current => !current); }} className="w-9 h-9 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm border flex-shrink-0" title="Quick timer" style={{ touchAction: 'manipulation', background: running ? '#D9A94B' : done ? '#7E9B86' : '#FEF3C7', borderColor: running ? '#D9A94B' : done ? '#7E9B86' : '#D97706', color: running || done ? '#ffffff' : '#92400E' }}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="10" cy="11" r="7"/><path d="M10 7v4l2.5 2.5"/><path d="M7.5 2.5h5"/><path d="M10 2.5v2"/></svg>
        <span style={labelStyle}>timer</span>
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
