'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PRESETS = [30, 45, 60];
const LEAD_IN_SECONDS = 10;
const SWITCH_SECONDS = 15;
const BREAK_SECONDS = 30;
const TIMER_STORAGE_KEY = 'pt-quick-timer-state';
const CUSTOM_WORKOUTS_STORAGE_KEY = 'pt-custom-workouts';

type Mode = 'timer' | 'stopwatch';
type SequenceKey = 'one60' | 'two60' | 'three60' | 'one30' | 'two30' | 'three30' | `custom-${string}`;
type StepKind = 'stretch' | 'switch' | 'break' | 'reps';
type WorkoutUnit = 'seconds' | 'reps';
type WorkoutSides = 'both' | 'each';

type TimerStep = {
  seconds: number;
  cueAfter: string;
  kind: StepKind;
  label?: string;
  manual?: boolean;
  countdownToStretch?: boolean;
};

type SequenceOption = {
  key: SequenceKey;
  label: string;
  group?: '60 sec holds' | '30 sec holds';
  holdSeconds?: 30 | 60;
  steps: TimerStep[];
  workout?: CustomWorkout;
};

type CustomWorkoutExercise = {
  id: string;
  exerciseId?: string;
  name: string;
  categoryName?: string;
  categoryColor?: string;
  sets: number;
  unit: WorkoutUnit;
  amount: number;
  sides: WorkoutSides;
};

type CustomWorkout = {
  id: string;
  name: string;
  breakSeconds: number;
  exercises: CustomWorkoutExercise[];
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
  customSequence?: SequenceOption | null;
  endAt: number | null;
};

type SequenceResolution =
  | { done: true; lastCue: string }
  | { done: false; manual: true; index: number; lastCue: string }
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

function makeWorkoutExercise(name = 'Exercise'): CustomWorkoutExercise {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    sets: 2,
    unit: 'seconds',
    amount: 60,
    sides: 'each',
  };
}

function parseExercisePrescription(exercise: { id: string; name: string; sets?: string; cue?: string; categoryName?: string; categoryColor?: string }): CustomWorkoutExercise {
  const text = `${exercise.sets ?? ''} ${exercise.cue ?? ''}`
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
  const setsMatch = text.match(/(\d+)\s*(?:-\s*\d+)?\s*(?:x|×|sets?\b)/)
    ?? text.match(/(?:x|×)\s*(\d+)/)
    ?? text.match(/\b(\d+)\s*rounds?\b/);
  const compactMatch = text.match(/\b(\d+)\s*(?:x|×)\s*(\d+)\b/);
  const minutesRange = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:min|minutes?)/);
  const minutesSingle = text.match(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)/);
  const secondsRange = text.match(/(\d+)\s*-\s*(\d+)\s*(?:sec|secs|seconds?)/);
  const secondsSingle = text.match(/(\d+)\s*(?:sec|secs|seconds?)/);
  const repsRange = text.match(/(\d+)\s*-\s*(\d+)\s*reps?/);
  const repsSingle = text.match(/(\d+)\s*reps?/);
  const hasEachSide = /\beach\b|\bper\b|\bside\b|\bleg\b|\bdirection\b|left.*right|right.*left/.test(text);
  const hasRepTarget = !!(repsRange || repsSingle || (compactMatch && /\breps?\b/.test(text)));
  const amount = minutesRange ? Math.round(Number(minutesRange[2]) * 60)
    : minutesSingle ? Math.round(Number(minutesSingle[1]) * 60)
      : secondsRange ? Number(secondsRange[2])
        : secondsSingle ? Number(secondsSingle[1])
          : repsRange ? Number(repsRange[2])
            : repsSingle ? Number(repsSingle[1])
              : compactMatch && hasRepTarget ? Number(compactMatch[2])
                : 60;
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    exerciseId: exercise.id,
    name: exercise.name,
    categoryName: exercise.categoryName,
    categoryColor: exercise.categoryColor,
    sets: setsMatch ? Math.max(1, Number(setsMatch[1])) : compactMatch ? Math.max(1, Number(compactMatch[1])) : 2,
    unit: hasRepTarget ? 'reps' : 'seconds',
    amount: Number.isFinite(amount) && amount > 0 ? amount : 60,
    sides: hasEachSide ? 'each' : 'both',
  };
}

function makeDefaultWorkout(): CustomWorkout {
  return {
    id: `workout-${Date.now()}`,
    name: 'Custom workout',
    breakSeconds: BREAK_SECONDS,
    exercises: [],
  };
}

function workoutSummary(workout: CustomWorkout) {
  return workout.exercises.map(ex => `${ex.name}: ${ex.sets} x ${ex.amount} ${ex.unit === 'seconds' ? 'sec' : 'reps'} ${ex.sides === 'each' ? 'each side' : 'both'}`).join(' · ');
}

function noteForWorkoutExercise(exercise: CustomWorkoutExercise) {
  const unit = exercise.unit === 'seconds' ? 'seconds' : 'reps';
  const side = exercise.sides === 'each' ? 'each side' : 'both';
  return `${exercise.sets} x ${exercise.amount} ${unit} ${side}`;
}

function notesForCustomWorkout(workout: CustomWorkout) {
  const notes = new Map<string, string[]>();
  workout.exercises.forEach(exercise => {
    if (!exercise.exerciseId) return;
    const current = notes.get(exercise.exerciseId) ?? [];
    current.push(noteForWorkoutExercise(exercise));
    notes.set(exercise.exerciseId, current);
  });
  return Array.from(notes.entries()).map(([exerciseId, lines]) => ({ exerciseId, note: lines.join('\n') }));
}

function categoryAccent(color?: string) {
  if (color === 'orange') return '#C17B4F';
  if (color === 'blue') return '#5B9BD5';
  if (color === 'purple') return '#8B5CF6';
  if (color === 'red') return '#EF4444';
  return '#7E9B86';
}

function buildCustomSequence(workout: CustomWorkout): SequenceOption {
  const steps: TimerStep[] = [];
  workout.exercises.forEach((exercise, exerciseIndex) => {
    for (let set = 1; set <= Math.max(1, exercise.sets); set += 1) {
      const prefix = `${exercise.name} set ${set}/${exercise.sets}`;
      if (exercise.unit === 'seconds') {
        if (exercise.sides === 'each') {
          steps.push({ seconds: exercise.amount, cueAfter: 'Switch sides', kind: 'stretch', label: `${prefix} · side A · ${exercise.amount}s` });
          steps.push({ seconds: SWITCH_SECONDS, cueAfter: `${exercise.name} side B`, kind: 'switch', countdownToStretch: true, label: 'Switch sides' });
          steps.push({ seconds: exercise.amount, cueAfter: set === exercise.sets ? 'Exercise done' : `${exercise.name} next set`, kind: 'stretch', label: `${prefix} · side B · ${exercise.amount}s` });
        } else {
          steps.push({ seconds: exercise.amount, cueAfter: set === exercise.sets ? 'Exercise done' : `${exercise.name} next set`, kind: 'stretch', label: `${prefix} · ${exercise.amount}s` });
        }
      } else {
        const sideText = exercise.sides === 'each' ? 'each side' : 'both';
        steps.push({ seconds: 0, cueAfter: set === exercise.sets ? 'Exercise done' : `${exercise.name} next set`, kind: 'reps', manual: true, label: `${prefix} · ${exercise.amount} reps · ${sideText}` });
      }
    }
    if (exerciseIndex < workout.exercises.length - 1 && workout.breakSeconds > 0) {
      const nextName = workout.exercises[exerciseIndex + 1]?.name ?? 'next exercise';
      steps.push({ seconds: workout.breakSeconds, cueAfter: `Start ${nextName}`, kind: 'break', countdownToStretch: true, label: `Break · ${workout.breakSeconds}s` });
    }
  });
  return { key: `custom-${workout.id}`, label: workout.name.trim() || 'Custom workout', steps, workout };
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
  if (step.label) return step.label;
  if (step.kind === 'reps') return 'Reps';
  if (step.kind === 'switch') return 'Switch · 15 sec';
  if (step.kind === 'break') return 'Break · 30 sec';
  return step.seconds === 60 ? 'Stretch · 1 min' : 'Stretch · 30 sec';
}

function startMessageForStep(step?: TimerStep) {
  if (!step?.label) return 'Start';
  return `Start ${step.label.split(' set ')[0]}`;
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
  if (seq.holdSeconds) {
    const count = seq.label.split(' ')[0];
    return `${count} x ${seq.holdSeconds} seconds ea side`;
  }
  return seq.steps.map(step => step.label).filter(Boolean).join('\n');
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
  exercises?: Array<{ id: string; name: string; sets?: string; cue?: string; categoryName?: string; categoryColor?: string }>;
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
  const [activeSequenceOption, setActiveSequenceOption] = useState<SequenceOption>(DEFAULT_SEQUENCE);
  const [customWorkouts, setCustomWorkouts] = useState<CustomWorkout[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState('');
  const [workoutDraft, setWorkoutDraft] = useState<CustomWorkout>(() => makeDefaultWorkout());
  const [showWorkoutBuilder, setShowWorkoutBuilder] = useState(false);
  const [exerciseToAddId, setExerciseToAddId] = useState('');

  const [logExerciseId, setLogExerciseId] = useState('');
  const [logNoteText, setLogNoteText] = useState('');
  const [logSaved, setLogSaved] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const bellOnRef = useRef(bellOn);
  const originalTitleRef = useRef('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSequenceRef = useRef<TimerStep[]>(DEFAULT_SEQUENCE.steps);
  const activeSequenceOptionRef = useRef<SequenceOption>(DEFAULT_SEQUENCE);
  const endAtRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>('timer');
  const runningRef = useRef(false);
  const sequenceActiveRef = useRef(false);
  const sequenceIndexRef = useRef(0);
  const sequenceKeyRef = useRef<SequenceKey | null>(null);
  const lastCountdownSecondRef = useRef<number | null>(null);

  useEffect(() => { bellOnRef.current = bellOn; }, [bellOn]);

  // Save original page title on mount, restore on unmount
  useEffect(() => {
    if (typeof document === 'undefined') return;
    originalTitleRef.current = document.title;
    return () => { document.title = originalTitleRef.current; };
  }, []);

  // Update document title to mimic native timer indicator (shows in iOS app switcher)
  useEffect(() => {
    if (typeof document === 'undefined' || !mounted) return;
    if (running && mode === 'timer') {
      document.title = `⏱ ${formatTime(remaining)} · PT Timer`;
    } else if (done && mode === 'timer') {
      document.title = `✅ Done · PT Motivator`;
    } else {
      document.title = originalTitleRef.current || 'PT Motivator';
    }
  }, [running, done, remaining, mode, mounted]);

  const activeSequence = activeSequenceOption;
  const currentStep = sequenceActive && sequenceIndex >= 0 ? activeSequence.steps[sequenceIndex] : undefined;
  const shownSeconds = mode === 'timer' ? remaining : elapsed;
  const pct = mode === 'timer' ? (duration ? remaining / duration : sequenceActive ? 1 : 0) : ((elapsed % 60) / 60);
  const circumference = 2 * Math.PI * 22;
  const dashOffset = circumference * (1 - pct);
  const sequenceLabel = sequenceActive
    ? sequenceIndex < 0
      ? 'Start in 10'
      : `${activeSequence.label} · ${segmentLabel(currentStep)}`
    : '';

  // Pre-fill log note when timer completes
  useEffect(() => {
    if (!done || sequenceActive) return;
    setLogNoteText(sequenceKey ? noteForSequence(getSequence(sequenceKey)) : `1 x ${duration} seconds`);
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
      customSequence: activeSequenceOptionRef.current.key.toString().startsWith('custom-') ? activeSequenceOptionRef.current : null,
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
    const completedWorkout = activeSequenceOptionRef.current.workout;
    endAtRef.current = null;
    setRemaining(0);
    setDone(true);
    setSequenceActive(false);
    sequenceActiveRef.current = false;
    playCue(message);
    persistTimer({ running: false, done: true, remaining: 0, sequenceActive: false, endAt: null, cue: message });
    if (completedWorkout && onSaveNote) {
      notesForCustomWorkout(completedWorkout).forEach(({ exerciseId, note }) => {
        void onSaveNote(exerciseId, `${completedWorkout.name}: ${note}`);
      });
      setLogSaved(true);
    }
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
        lastCue = startMessageForStep(steps[0]);
        index = 0;
        if (steps[0]?.manual) return { done: false, manual: true, index, lastCue };
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
        if (next.manual) return { done: false, manual: true, index, lastCue };
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
    if ('manual' in resolved && resolved.manual) {
      stopTimer();
      endAtRef.current = null;
      sequenceIndexRef.current = resolved.index;
      setSequenceIndex(resolved.index);
      setDuration(0);
      setRemaining(0);
      if (playMissedCue && resolved.lastCue) playCue(resolved.lastCue);
      persistTimer({ running: false, done: false, duration: 0, remaining: 0, sequenceIndex: resolved.index, endAt: null, cue: resolved.lastCue || cue });
      return;
    }

    if ('endAt' in resolved) {
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
    }
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
    if (sequenceActive && currentStep?.manual) {
      advanceManualStep();
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
    activeSequenceOptionRef.current = option;
    setActiveSequenceOption(option);
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
    setCue(`${option.label} ready`);
    persistTimer({ mode: 'timer', running: false, done: false, duration: LEAD_IN_SECONDS, remaining: LEAD_IN_SECONDS, sequenceActive: true, sequenceIndex: -1, sequenceKey: option.key, endAt: null, cue: `${option.label} ready` });
  };

  const advanceManualStep = () => {
    if (!sequenceActiveRef.current) return;
    const steps = activeSequenceRef.current;
    const current = steps[sequenceIndexRef.current];
    const nextIndex = sequenceIndexRef.current + 1;
    const next = steps[nextIndex];
    if (!next) {
      finishTimer(current?.cueAfter || 'End');
      return;
    }
    sequenceIndexRef.current = nextIndex;
    setSequenceIndex(nextIndex);
    lastCountdownSecondRef.current = null;
    if (next.manual) {
      stopTimer();
      endAtRef.current = null;
      setDuration(0);
      setRemaining(0);
      playCue(next.label ?? 'Do reps');
      persistTimer({ running: false, done: false, duration: 0, remaining: 0, sequenceIndex: nextIndex, endAt: null, cue: next.label ?? 'Do reps' });
      return;
    }
    const endAt = Date.now() + next.seconds * 1000;
    endAtRef.current = endAt;
    setDuration(next.seconds);
    setRemaining(next.seconds);
    runningRef.current = true;
    setRunning(true);
    playCue(current?.cueAfter || next.label || 'Start');
    persistTimer({ running: true, done: false, duration: next.seconds, remaining: next.seconds, sequenceIndex: nextIndex, endAt, cue: current?.cueAfter || next.label || 'Start' });
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
      const option = stored.customSequence ?? getSequence(stored.sequenceKey);
      activeSequenceRef.current = option.steps;
      activeSequenceOptionRef.current = option;
      setActiveSequenceOption(option);
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
    try {
      const raw = localStorage.getItem(CUSTOM_WORKOUTS_STORAGE_KEY);
      const stored = raw ? JSON.parse(raw) as CustomWorkout[] : [];
      const usable = Array.isArray(stored) && stored.length > 0 ? stored : [makeDefaultWorkout()];
      setCustomWorkouts(usable);
      setSelectedWorkoutId(usable[0]?.id ?? '');
      setWorkoutDraft(usable[0] ?? makeDefaultWorkout());
      if (!raw) localStorage.setItem(CUSTOM_WORKOUTS_STORAGE_KEY, JSON.stringify(usable));
    } catch {
      const fallback = makeDefaultWorkout();
      setCustomWorkouts([fallback]);
      setSelectedWorkoutId(fallback.id);
      setWorkoutDraft(fallback);
    }
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

  const persistWorkouts = (next: CustomWorkout[], selectedId = selectedWorkoutId) => {
    setCustomWorkouts(next);
    localStorage.setItem(CUSTOM_WORKOUTS_STORAGE_KEY, JSON.stringify(next));
    if (selectedId) setSelectedWorkoutId(selectedId);
  };

  const updateWorkoutExercise = (id: string, patch: Partial<CustomWorkoutExercise>) => {
    setWorkoutDraft(prev => ({
      ...prev,
      exercises: prev.exercises.map(ex => ex.id === id ? { ...ex, ...patch } : ex),
    }));
  };

  const moveWorkoutExercise = (id: string, direction: -1 | 1) => {
    setWorkoutDraft(prev => {
      const index = prev.exercises.findIndex(ex => ex.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.exercises.length) return prev;
      const nextExercises = [...prev.exercises];
      [nextExercises[index], nextExercises[target]] = [nextExercises[target], nextExercises[index]];
      return { ...prev, exercises: nextExercises };
    });
  };

  const addSavedExerciseToWorkout = (exerciseId = exerciseToAddId) => {
    const exercise = exercises?.find(item => item.id === exerciseId);
    if (!exercise) return;
    if (workoutDraft.exercises.some(item => item.exerciseId === exerciseId)) {
      setWorkoutDraft(prev => ({ ...prev, exercises: prev.exercises.filter(item => item.exerciseId !== exerciseId) }));
      setExerciseToAddId('');
      return;
    }
    const parsed = parseExercisePrescription(exercise);
    setWorkoutDraft(prev => ({ ...prev, exercises: [...prev.exercises, parsed] }));
    setExerciseToAddId('');
  };

  const smartAddAllSavedExercises = () => {
    if (!exercises?.length) return;
    setWorkoutDraft(prev => ({
      ...prev,
      exercises: exercises.map(exercise => parseExercisePrescription(exercise)),
    }));
  };

  const saveWorkoutDraft = () => {
    const cleaned: CustomWorkout = {
      ...workoutDraft,
      id: workoutDraft.id || `workout-${Date.now()}`,
      name: workoutDraft.name.trim() || 'Custom workout',
      breakSeconds: Math.max(0, Math.round(Number(workoutDraft.breakSeconds) || 0)),
      exercises: workoutDraft.exercises
        .filter(ex => ex.name.trim())
        .map(ex => ({
          ...ex,
          name: ex.name.trim(),
          sets: Math.max(1, Math.round(Number(ex.sets) || 1)),
          amount: Math.max(1, Math.round(Number(ex.amount) || 1)),
        })),
    };
    if (cleaned.exercises.length === 0) cleaned.exercises = [makeWorkoutExercise()];
    const exists = customWorkouts.some(workout => workout.id === cleaned.id);
    const next = exists ? customWorkouts.map(workout => workout.id === cleaned.id ? cleaned : workout) : [...customWorkouts, cleaned];
    persistWorkouts(next, cleaned.id);
    setWorkoutDraft(cleaned);
  };

  const selectWorkout = (id: string) => {
    const next = customWorkouts.find(workout => workout.id === id);
    if (!next) return;
    setSelectedWorkoutId(id);
    setWorkoutDraft(next);
  };

  const newWorkout = () => {
    const next = makeDefaultWorkout();
    setWorkoutDraft(next);
    setSelectedWorkoutId(next.id);
    setShowWorkoutBuilder(true);
  };

  const deleteWorkout = (id: string) => {
    const next = customWorkouts.filter(workout => workout.id !== id);
    const fallback = next[0] ?? makeDefaultWorkout();
    persistWorkouts(next.length ? next : [fallback], fallback.id);
    setWorkoutDraft(fallback);
  };

  const startCustomWorkout = async () => {
    const workout = customWorkouts.find(item => item.id === selectedWorkoutId) ?? workoutDraft;
    const option = buildCustomSequence(workout);
    if (option.steps.length === 0) return;
    await startSequencePreset(option);
  };

  const groupedSequenceOptions = [
    { label: '60 sec holds', options: SEQUENCE_OPTIONS.filter(option => option.group === '60 sec holds') },
    { label: '30 sec holds', options: SEQUENCE_OPTIONS.filter(option => option.group === '30 sec holds') },
  ];

  const groupedCurrentExercises = (exercises ?? []).reduce<Array<{ name: string; color?: string; items: NonNullable<QuickTimerWidgetProps['exercises']> }>>((groups, exercise) => {
    const name = exercise.categoryName ?? 'Current exercises';
    let group = groups.find(item => item.name === name);
    if (!group) {
      group = { name, color: exercise.categoryColor, items: [] };
      groups.push(group);
    }
    group.items.push(exercise);
    return groups;
  }, []);

  const showLogSection = done && !sequenceActive && mode === 'timer' && !activeSequence.workout && !!onSaveNote && !!(exercises?.length);

  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed right-3 bottom-3 sm:right-4 sm:bottom-5 z-[9999] bg-white rounded-2xl shadow-2xl border border-stone-100 p-4"
      style={{ width: showWorkoutBuilder ? 'min(560px, calc(100vw - 24px))' : 292, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', touchAction: 'manipulation' }}
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

          <div className="mb-3 rounded-xl border border-stone-100 bg-stone-50 p-2.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Custom workout</p>
              <button onClick={event => { event.stopPropagation(); setShowWorkoutBuilder(value => !value); }} className="text-[10px] font-bold rounded-lg px-2 py-1" style={{ color: '#476653', background: '#E4ECE6' }}>{showWorkoutBuilder ? 'Hide' : 'Edit'}</button>
            </div>
            <div className="flex gap-1.5">
              <select value={selectedWorkoutId} onChange={event => selectWorkout(event.target.value)} onClick={event => event.stopPropagation()} className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2" style={{ padding: '6px 8px', fontSize: 14, colorScheme: 'light' }}>
                {customWorkouts.map(workout => <option key={workout.id} value={workout.id}>{workout.name}</option>)}
              </select>
              <button onClick={event => { event.stopPropagation(); void startCustomWorkout(); }} className="rounded-lg px-3 text-xs font-bold text-white" style={{ background: '#D9A94B' }}>Load</button>
            </div>
            {selectedWorkoutId && customWorkouts.find(workout => workout.id === selectedWorkoutId) && (
              <p className="mt-1.5 text-[10px] leading-snug text-stone-400 line-clamp-2">{workoutSummary(customWorkouts.find(workout => workout.id === selectedWorkoutId)!)}</p>
            )}
          </div>

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
          {running && (sequenceIndex < 0 || !!currentStep?.countdownToStretch) && remaining <= 5 && <p className="text-[11px] font-bold mt-0.5">Stretch starts in {remaining}</p>}
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
            <button onClick={e => { e.stopPropagation(); if (onOpenNote && logExerciseId) { setOpen(false); onOpenNote(logExerciseId); } else { setLogSaved(false); } }} className="w-full text-center text-xs font-bold py-0.5 rounded-lg hover:bg-stone-100 transition-colors" style={{ color: '#7E9B86' }}>✓ Note logged · tap to edit</button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={event => { event.stopPropagation(); if (running) pauseTimer(); else start(); }} className="flex-1 rounded-lg text-xs font-bold transition-colors" style={{ padding: '10px 0', background: running ? '#f5f5f4' : '#D9A94B', color: running ? '#57534e' : '#fff' }}>{running ? 'Pause' : currentStep?.manual ? 'Next' : done && mode === 'timer' ? 'Restart' : 'Start'}</button>
        <button onClick={event => { event.stopPropagation(); reset(); }} className="rounded-lg text-xs font-semibold transition-colors" style={{ padding: '10px 12px', background: '#f5f5f4', color: '#78716c' }}>Reset</button>
      </div>
    </div>
  ) : null;

  const builderSheet = showWorkoutBuilder ? (
    <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowWorkoutBuilder(false)}>
      <div className="w-full sm:max-w-2xl bg-[#F6F1E7] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-stone-100 flex flex-col" style={{ maxHeight: '92dvh' }} onClick={event => event.stopPropagation()}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-semibold text-stone-800">Build workout</h2>
            <p className="text-[11px] text-stone-400">Tap exercises from your current list, then confirm sets/time/reps.</p>
          </div>
          <button onClick={() => setShowWorkoutBuilder(false)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 text-xl">×</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 p-3 space-y-2">
            <input value={workoutDraft.name} onChange={event => setWorkoutDraft(prev => ({ ...prev, name: event.target.value }))} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 focus:outline-none" style={{ fontSize: 16, colorScheme: 'light' }} aria-label="Workout name" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Break</span>
              <input value={workoutDraft.breakSeconds} onChange={event => setWorkoutDraft(prev => ({ ...prev, breakSeconds: Number(event.target.value) }))} type="number" min="0" step="5" className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm font-semibold" style={{ fontSize: 16, colorScheme: 'light' }} aria-label="Break seconds" />
              <span className="text-xs text-stone-400">seconds between exercises</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-100 p-3">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Current exercises</p>
            </div>
            <div className="space-y-3">
              {groupedCurrentExercises.map(group => (
                <div key={group.name}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: categoryAccent(group.color) }}>{group.name}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map(exercise => {
                      const selected = workoutDraft.exercises.some(item => item.exerciseId === exercise.id);
                      return (
                        <button
                          key={exercise.id}
                          onClick={event => { event.stopPropagation(); addSavedExerciseToWorkout(exercise.id); }}
                          className="text-left rounded-xl border px-3 py-2 transition-colors"
                          style={{ borderColor: selected ? categoryAccent(group.color) : '#e7e5e4', background: selected ? `${categoryAccent(group.color)}12` : '#fff' }}
                        >
                          <span className="flex items-center justify-between gap-2 text-sm font-bold text-stone-800 leading-snug">
                            <span className="min-w-0 truncate">{exercise.name}</span>
                            {selected && <span className="text-[10px] font-bold uppercase tracking-wide flex-shrink-0" style={{ color: categoryAccent(group.color) }}>Selected</span>}
                          </span>
                          <span className="block text-[11px] text-stone-400 truncate">{exercise.sets || exercise.cue || 'Defaults to 2 x 60 sec'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-100 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Workout order</p>
            {workoutDraft.exercises.length === 0 && <p className="text-sm text-stone-400 text-center py-4">Tap exercises above to add them.</p>}
            {workoutDraft.exercises.map((exercise, index) => (
              <div key={exercise.id} className="rounded-xl border p-2 space-y-2" style={{ borderColor: exercise.exerciseId ? `${categoryAccent(exercise.categoryColor)}55` : '#f5f5f4', boxShadow: exercise.exerciseId ? `inset 3px 0 0 ${categoryAccent(exercise.categoryColor)}` : 'none' }}>
                <div className="flex gap-2">
                  <div className="flex gap-1">
                    <button onClick={event => { event.stopPropagation(); moveWorkoutExercise(exercise.id, -1); }} disabled={index === 0} className="w-8 rounded-lg text-xs font-bold disabled:opacity-30" style={{ background: '#f5f5f4', color: '#78716c' }}>↑</button>
                    <button onClick={event => { event.stopPropagation(); moveWorkoutExercise(exercise.id, 1); }} disabled={index === workoutDraft.exercises.length - 1} className="w-8 rounded-lg text-xs font-bold disabled:opacity-30" style={{ background: '#f5f5f4', color: '#78716c' }}>↓</button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-800 truncate">{exercise.name}</p>
                    {exercise.categoryName && <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: categoryAccent(exercise.categoryColor) }}>{exercise.categoryName}</p>}
                  </div>
                  <button onClick={event => { event.stopPropagation(); setWorkoutDraft(prev => ({ ...prev, exercises: prev.exercises.filter(item => item.id !== exercise.id) })); }} className="w-8 rounded-lg text-sm font-bold" style={{ background: '#f5f5f4', color: '#a8a29e' }}>×</button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <input value={exercise.sets} onChange={event => updateWorkoutExercise(exercise.id, { sets: Number(event.target.value) })} type="number" min="1" className="rounded-lg border border-stone-200 px-2 py-1 text-sm font-semibold" style={{ fontSize: 16, colorScheme: 'light' }} aria-label="Sets" />
                  <input value={exercise.amount} onChange={event => updateWorkoutExercise(exercise.id, { amount: Number(event.target.value) })} type="number" min="1" className="rounded-lg border border-stone-200 px-2 py-1 text-sm font-semibold" style={{ fontSize: 16, colorScheme: 'light' }} aria-label="Amount" />
                  <select value={exercise.unit} onChange={event => updateWorkoutExercise(exercise.id, { unit: event.target.value as WorkoutUnit })} className="rounded-lg border border-stone-200 bg-white px-1 py-1 text-xs font-semibold" style={{ colorScheme: 'light' }} aria-label="Unit"><option value="seconds">sec</option><option value="reps">reps</option></select>
                  <select value={exercise.sides} onChange={event => updateWorkoutExercise(exercise.id, { sides: event.target.value as WorkoutSides })} className="rounded-lg border border-stone-200 bg-white px-1 py-1 text-xs font-semibold" style={{ colorScheme: 'light' }} aria-label="Sides"><option value="both">both</option><option value="each">each</option></select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-stone-200 bg-[#F6F1E7] flex gap-2 flex-shrink-0">
          <button onClick={event => { event.stopPropagation(); saveWorkoutDraft(); setShowWorkoutBuilder(false); }} className="flex-1 rounded-xl py-3 text-sm font-bold text-white" style={{ background: '#7E9B86' }}>Save workout</button>
          <button onClick={event => { event.stopPropagation(); saveWorkoutDraft(); setShowWorkoutBuilder(false); void startCustomWorkout(); }} className="flex-1 rounded-xl py-3 text-sm font-bold text-white" style={{ background: '#D9A94B' }}>Save & load</button>
        </div>
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
      {mounted && builderSheet ? createPortal(builderSheet, document.body) : null}
    </>
  );
}
