'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PRESETS = [30, 45, 60];
const LEAD_IN_SECONDS = 10;
const SWITCH_SECONDS = 15;
const BREAK_SECONDS = 30;
const TIMER_STORAGE_KEY = 'pt-quick-timer-state';
const CUSTOM_WORKOUTS_CONFIG_KEY = 'customTimerWorkouts';

type Mode = 'timer' | 'stopwatch';
type SequenceKey = 'one60' | 'two60' | 'three60' | 'one30' | 'two30' | 'three30' | `custom-${string}`;
type StepKind = 'stretch' | 'switch' | 'break' | 'reps';
type WorkoutUnit = 'seconds' | 'reps';
type WorkoutSides = 'both' | 'each' | 'inversion_eversion_both';

type TimerStep = {
  seconds: number;
  cueBefore?: string;
  cueAfter: string;
  kind: StepKind;
  label?: string;
  exerciseId?: string;
  exerciseName?: string;
  workNote?: string;
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
  const hasInversionEversion = /\binversion\b/.test(text) && /\beversion\b/.test(text);
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
    sides: hasInversionEversion ? 'inversion_eversion_both' : hasEachSide ? 'each' : 'both',
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

function sanitizeWorkout(workout: CustomWorkout): CustomWorkout {
  return {
    ...workout,
    name: workout.name?.trim() || 'Custom workout',
    breakSeconds: Number.isFinite(Number(workout.breakSeconds)) ? Number(workout.breakSeconds) : BREAK_SECONDS,
    exercises: (workout.exercises ?? []).filter(exercise => !!exercise.exerciseId).map(exercise => ({
      ...exercise,
      sides: ['both', 'each', 'inversion_eversion_both'].includes(exercise.sides) ? exercise.sides : 'both',
    })),
  };
}

function sidePatternLabel(sides: WorkoutSides) {
  if (sides === 'each') return 'right then left';
  if (sides === 'inversion_eversion_both') return 'right inversion, right eversion, left inversion, left eversion';
  return 'both';
}

function workoutSummary(workout: CustomWorkout) {
  return workout.exercises.map(ex => `${ex.name}: ${ex.sets} x ${ex.amount} ${ex.unit === 'seconds' ? 'sec' : 'reps'} ${sidePatternLabel(ex.sides)}`).join(' · ');
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
        if (exercise.sides === 'inversion_eversion_both') {
          const parts = ['right inversion', 'right eversion', 'left inversion', 'left eversion'];
          parts.forEach((part, partIndex) => {
            const isLastPart = partIndex === parts.length - 1;
            const nextPart = parts[partIndex + 1];
            steps.push({ seconds: exercise.amount, cueBefore: `Start ${exercise.name}, set ${set} of ${exercise.sets}, ${part}`, cueAfter: isLastPart ? (set === exercise.sets ? `${exercise.name} done` : 'Set break') : `Switch to ${nextPart}`, kind: 'stretch', label: `${prefix} · ${part} · ${exercise.amount}s`, exerciseId: exercise.exerciseId, exerciseName: exercise.name, workNote: `set ${set}/${exercise.sets}, ${part}, ${exercise.amount} seconds` });
            if (!isLastPart) steps.push({ seconds: SWITCH_SECONDS, cueBefore: `Switch to ${nextPart} for ${exercise.name}, set ${set}`, cueAfter: `Start ${exercise.name}, set ${set} of ${exercise.sets}, ${nextPart}`, kind: 'switch', countdownToStretch: true, label: `Switch to ${nextPart}` });
          });
        } else if (exercise.sides === 'each') {
          steps.push({ seconds: exercise.amount, cueBefore: `Start ${exercise.name}, set ${set} of ${exercise.sets}, right leg`, cueAfter: 'Switch to left leg', kind: 'stretch', label: `${prefix} · right leg · ${exercise.amount}s`, exerciseId: exercise.exerciseId, exerciseName: exercise.name, workNote: `set ${set}/${exercise.sets}, right leg, ${exercise.amount} seconds` });
          steps.push({ seconds: SWITCH_SECONDS, cueBefore: `Switch to left leg for ${exercise.name}, set ${set}`, cueAfter: `Start ${exercise.name}, set ${set} of ${exercise.sets}, left leg`, kind: 'switch', countdownToStretch: true, label: 'Switch to left leg' });
          steps.push({ seconds: exercise.amount, cueBefore: `Start ${exercise.name}, set ${set} of ${exercise.sets}, left leg`, cueAfter: set === exercise.sets ? `${exercise.name} done` : 'Set break', kind: 'stretch', label: `${prefix} · left leg · ${exercise.amount}s`, exerciseId: exercise.exerciseId, exerciseName: exercise.name, workNote: `set ${set}/${exercise.sets}, left leg, ${exercise.amount} seconds` });
        } else {
          steps.push({ seconds: exercise.amount, cueBefore: `Start ${exercise.name}, set ${set} of ${exercise.sets}`, cueAfter: set === exercise.sets ? `${exercise.name} done` : 'Set break', kind: 'stretch', label: `${prefix} · ${exercise.amount}s`, exerciseId: exercise.exerciseId, exerciseName: exercise.name, workNote: `set ${set}/${exercise.sets}, ${exercise.amount} seconds` });
        }
      } else {
        const sideText = sidePatternLabel(exercise.sides);
        steps.push({ seconds: 0, cueBefore: `Do ${exercise.name}, set ${set} of ${exercise.sets}, ${exercise.amount} reps ${sideText}`, cueAfter: set === exercise.sets ? `${exercise.name} done` : 'Set break', kind: 'reps', manual: true, label: `${prefix} · ${exercise.amount} reps · ${sideText}`, exerciseId: exercise.exerciseId, exerciseName: exercise.name, workNote: `set ${set}/${exercise.sets}, ${exercise.amount} reps ${sideText}` });
      }
      if (set < exercise.sets) {
        steps.push({ seconds: BREAK_SECONDS, cueBefore: `Rest ${BREAK_SECONDS} seconds before ${exercise.name}, set ${set + 1}`, cueAfter: `${exercise.name} set ${set + 1}`, kind: 'break', countdownToStretch: true, label: `Set break · ${BREAK_SECONDS}s` });
      }
    }
    if (exerciseIndex < workout.exercises.length - 1 && workout.breakSeconds > 0) {
      const nextName = workout.exercises[exerciseIndex + 1]?.name ?? 'next exercise';
      steps.push({ seconds: workout.breakSeconds, cueBefore: `Rest ${workout.breakSeconds} seconds before ${nextName}`, cueAfter: `Start ${nextName}`, kind: 'break', countdownToStretch: true, label: `Exercise break · ${workout.breakSeconds}s` });
    }
  });
  return { key: `custom-${workout.id}`, label: workout.name.trim() || 'Custom workout', steps, workout };
}

function workoutDurationSummary(workout: CustomWorkout) {
  const steps = buildCustomSequence(workout).steps;
  const timedSeconds = steps.reduce((total, step) => total + Math.max(0, step.seconds || 0), 0);
  const manualCount = steps.filter(step => step.manual).length;
  const minutes = Math.floor(timedSeconds / 60);
  const seconds = timedSeconds % 60;
  const time = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
  return manualCount > 0 ? `${time}+ (${manualCount} manual rep ${manualCount === 1 ? 'set' : 'sets'})` : time;
}

function notesForCompletedSteps(workoutName: string, steps: TimerStep[]) {
  const notes = new Map<string, string[]>();
  steps.forEach(step => {
    if (!step.exerciseId || !step.workNote) return;
    const current = notes.get(step.exerciseId) ?? [];
    current.push(step.workNote);
    notes.set(step.exerciseId, current);
  });
  return Array.from(notes.entries()).map(([exerciseId, lines]) => ({ exerciseId, note: `${workoutName}: ${lines.join('; ')}` }));
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
  if (step?.cueBefore) return step.cueBefore;
  if (!step?.label) return 'Start';
  return `Start ${step.label.split(' set ')[0]}`;
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function stepTitle(step?: TimerStep, fallback = 'Ready') {
  if (!step) return fallback;
  if (step.exerciseName) return step.exerciseName;
  if (step.label) return step.label.split(' · ')[0];
  if (step.kind === 'break') return 'Break';
  if (step.kind === 'switch') return 'Switch to left leg';
  if (step.kind === 'reps') return 'Reps';
  return 'Hold';
}

function stepDetail(step?: TimerStep) {
  if (!step) return '';
  if (step.label) return step.label;
  if (step.manual) return 'Manual rep set';
  if (step.kind === 'break') return `${step.seconds}s recovery`;
  if (step.kind === 'switch') return `${step.seconds}s transition`;
  return `${step.seconds}s work`;
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
    return `${count} x ${seq.holdSeconds} seconds right + left`;
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
  exercises?: Array<{ id: string; name: string; sets?: string; cue?: string; tips?: string[]; categoryName?: string; categoryColor?: string }>;
  onSaveNote?: (exerciseId: string, note: string) => void | Promise<void>;
  onOpenNote?: (exerciseId: string) => void;
}

export default function QuickTimerWidget({ exercises, onSaveNote, onOpenNote }: QuickTimerWidgetProps = {}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [workoutModeOpen, setWorkoutModeOpen] = useState(false);
  const [workoutInfoStep, setWorkoutInfoStep] = useState<TimerStep | null>(null);
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
  const [reorderText, setReorderText] = useState('');

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
  const completedWorkStepsRef = useRef<TimerStep[]>([]);

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

  const persistTimer = (patch: Partial<StoredTimerState> = {}, forceNotificationSync = false) => {
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
    window.dispatchEvent(new CustomEvent('pt-timer-state-updated', { detail: { force: forceNotificationSync } }));
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

  const markStepCompleted = (step?: TimerStep) => {
    if (!step?.exerciseId || !step.workNote) return;
    completedWorkStepsRef.current.push(step);
  };

  const isCountdownToStretch = () => {
    if (!sequenceActiveRef.current) return false;
    if (sequenceIndexRef.current < 0) return true;
    return !!activeSequenceRef.current[sequenceIndexRef.current]?.countdownToStretch;
  };

  const maybeCountdownBeep = (secondsLeft: number) => {
    if (!runningRef.current) return;
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
    persistTimer({ running: false, done: true, remaining: 0, sequenceActive: false, endAt: null, cue: message }, true);
    if (completedWorkout && onSaveNote) {
      void Promise.all(notesForCompletedSteps(completedWorkout.name, completedWorkStepsRef.current).map(async ({ exerciseId, note }) => {
        const standardized = await standardizeWorkoutNote(exerciseId, note);
        await onSaveNote(exerciseId, standardized);
      }));
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
        markStepCompleted(current);
        lastCue = current.cueAfter;
        const nextIndex = index + 1;
        const next = steps[nextIndex];
        if (!next) return { done: true, lastCue };
        index = nextIndex;
        if (next.cueBefore) lastCue = next.cueBefore;
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
    completedWorkStepsRef.current = [];
    setRemaining(nextDuration);
    persistTimer({ running: false, done: false, sequenceActive: false, sequenceIndex: 0, endAt: null, remaining: nextDuration, duration: nextDuration, cue: '' }, true);
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
    completedWorkStepsRef.current = [];
    setElapsed(0);
    persistTimer({ mode: 'stopwatch', running: false, done: false, elapsed: 0, sequenceActive: false, endAt: null, cue: '' }, true);
  };

  const startCountdown = async () => {
    await unlockAudio();
    if (done) {
      resetTimer();
      return;
    }
    if (sequenceActive && currentStep?.manual) {
      markStepCompleted(currentStep);
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
    persistTimer({ mode: 'timer', running: true, done: false, remaining: startSeconds, duration, sequenceActive, sequenceIndex: sequenceIndexRef.current, sequenceKey: sequenceKeyRef.current, endAt }, true);
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
    persistTimer({ mode: 'stopwatch', running: true, done: false, sequenceActive: false, endAt: null }, true);
  };

  const startSequencePreset = async (option: SequenceOption) => {
    await unlockAudio();
    stopTimer();
    endAtRef.current = null;
    lastCountdownSecondRef.current = null;
    completedWorkStepsRef.current = [];
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
    setWorkoutModeOpen(true);
    persistTimer({ mode: 'timer', running: false, done: false, duration: LEAD_IN_SECONDS, remaining: LEAD_IN_SECONDS, sequenceActive: true, sequenceIndex: -1, sequenceKey: option.key, endAt: null, cue: `${option.label} ready` }, true);
  };

  const advanceManualStep = (resumeTimedStep = true) => {
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
      const nextCue = next.cueBefore ?? next.label ?? 'Do reps';
      playCue(nextCue);
      persistTimer({ running: false, done: false, duration: 0, remaining: 0, sequenceIndex: nextIndex, endAt: null, cue: nextCue }, true);
      return;
    }
    const endAt = Date.now() + next.seconds * 1000;
    endAtRef.current = resumeTimedStep ? endAt : null;
    setDuration(next.seconds);
    setRemaining(next.seconds);
    runningRef.current = resumeTimedStep;
    setRunning(resumeTimedStep);
    const nextCue = next.cueBefore || current?.cueAfter || next.label || 'Start';
    playCue(nextCue);
    persistTimer({ running: resumeTimedStep, done: false, duration: next.seconds, remaining: next.seconds, sequenceIndex: nextIndex, endAt: resumeTimedStep ? endAt : null, cue: nextCue }, true);
  };

  const skipSegment = () => {
    if (!sequenceActiveRef.current) return;
    const wasRunning = runningRef.current;
    stopTimer();
    endAtRef.current = null;
    advanceManualStep(wasRunning);
    if (!wasRunning) return;
  };

  const start = () => mode === 'timer' ? void startCountdown() : void startStopwatch();
  const reset = () => mode === 'timer' ? resetTimer() : resetStopwatch();

  const handleLogNote = async () => {
    if (!logExerciseId || !logNoteText || !onSaveNote) return;
    await onSaveNote(logExerciseId, logNoteText);
    setLogSaved(true);
  };

  const standardizeWorkoutNote = async (exerciseId: string, rawNote: string) => {
    const exercise = exercises?.find(item => item.id === exerciseId);
    try {
      const res = await fetch('/api/standardize-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawNote,
          exerciseName: exercise?.name ?? '',
          exerciseSets: exercise?.sets ?? '',
          exerciseCue: exercise?.cue ?? '',
          exerciseTips: exercise?.tips ?? [],
        }),
      });
      const data = await res.json().catch(() => ({})) as { standardizedNote?: string };
      return typeof data.standardizedNote === 'string' && data.standardizedNote.trim()
        ? data.standardizedNote.trim()
        : rawNote;
    } catch {
      return rawNote;
    }
  };

  const restoreStoredTimer = () => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return;
    try {
      localStorage.removeItem(TIMER_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('pt-timer-state-updated', { detail: { force: true } }));
    } catch {
      localStorage.removeItem(TIMER_STORAGE_KEY);
    }
  };

  useEffect(() => {
    setMounted(true);
    const loadCustomWorkouts = async () => {
      try {
        const res = await fetch(`/api/config?key=${CUSTOM_WORKOUTS_CONFIG_KEY}`, { cache: 'no-store' });
        const data = await res.json();
        const dbWorkouts = Array.isArray(data.value) ? data.value as CustomWorkout[] : null;
        const source = dbWorkouts && dbWorkouts.length > 0 ? dbWorkouts : [makeDefaultWorkout()];
        const usable = (Array.isArray(source) && source.length > 0 ? source : [makeDefaultWorkout()]).map(sanitizeWorkout);
        setCustomWorkouts(usable);
        setSelectedWorkoutId(usable[0]?.id ?? '');
        setWorkoutDraft(usable[0] ?? makeDefaultWorkout());
      } catch {
        const fallback = makeDefaultWorkout();
        setCustomWorkouts([fallback]);
        setSelectedWorkoutId(fallback.id);
        setWorkoutDraft(fallback);
      }
    };
    void loadCustomWorkouts();
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
    persistTimer({ mode: 'timer', duration: seconds, remaining: seconds, running: false, done: false, sequenceActive: false, sequenceKey: null, endAt: null, cue: '' }, true);
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
    persistTimer({ mode: next, running: false, done: false, sequenceActive: false, sequenceIndex: 0, endAt: null, cue: '' }, true);
  };

  const pauseTimer = () => {
    const pausedRemaining = mode === 'timer' && endAtRef.current ? Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000)) : remaining;
    stopTimer();
    endAtRef.current = null;
    setRemaining(pausedRemaining);
    persistTimer({ running: false, endAt: null, remaining: pausedRemaining }, true);
  };

  const persistWorkouts = async (next: CustomWorkout[], selectedId = selectedWorkoutId) => {
    const sanitized = next.map(sanitizeWorkout);
    setCustomWorkouts(sanitized);
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: CUSTOM_WORKOUTS_CONFIG_KEY, value: sanitized }),
    });
    if (selectedId) setSelectedWorkoutId(selectedId);
    return sanitized.find(workout => workout.id === selectedId) ?? sanitized[0];
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

  const applyWorkoutReorderText = () => {
    const text = reorderText.trim();
    if (!text) return;
    let requested: string[] = [];
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) requested = parsed.map(String);
      else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { order?: unknown[] }).order)) requested = (parsed as { order: unknown[] }).order.map(String);
      else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { exercises?: unknown[] }).exercises)) requested = (parsed as { exercises: unknown[] }).exercises.map(item => typeof item === 'string' ? item : String((item as { name?: unknown }).name ?? ''));
    } catch {
      requested = text.split(/\n|,|>/).map(item => item.replace(/^\d+[.)-]?\s*/, '').trim()).filter(Boolean);
    }
    if (!requested.length) return;
    setWorkoutDraft(prev => {
      const remaining = [...prev.exercises];
      const ordered: CustomWorkoutExercise[] = [];
      requested.forEach(name => {
        const needle = name.toLowerCase();
        const index = remaining.findIndex(ex => ex.name.toLowerCase().includes(needle) || needle.includes(ex.name.toLowerCase()));
        if (index >= 0) ordered.push(...remaining.splice(index, 1));
      });
      return ordered.length ? { ...prev, exercises: [...ordered, ...remaining] } : prev;
    });
  };

  const currentWorkoutOrderJson = () => JSON.stringify({
    order: workoutDraft.exercises.map(exercise => exercise.name),
  }, null, 2);

  const downloadWorkoutOrderJson = () => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([currentWorkoutOrderJson()], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (workoutDraft.name || 'workout-order').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workout-order';
    link.href = url;
    link.download = `${safeName}-order.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const addSavedExerciseToWorkout = (exerciseId: string) => {
    const exercise = exercises?.find(item => item.id === exerciseId);
    if (!exercise) return;
    if (workoutDraft.exercises.some(item => item.exerciseId === exerciseId)) {
      setWorkoutDraft(prev => ({ ...prev, exercises: prev.exercises.filter(item => item.exerciseId !== exerciseId) }));
      return;
    }
    const parsed = parseExercisePrescription(exercise);
    setWorkoutDraft(prev => ({ ...prev, exercises: [...prev.exercises, parsed] }));
  };

  const saveWorkoutDraft = async () => {
    const cleaned: CustomWorkout = {
      ...workoutDraft,
      id: workoutDraft.id || `workout-${Date.now()}`,
      name: workoutDraft.name.trim() || 'Custom workout',
      breakSeconds: Math.max(0, Math.round(Number(workoutDraft.breakSeconds) || 0)),
      exercises: workoutDraft.exercises
        .filter(ex => ex.exerciseId && ex.name.trim())
        .map(ex => ({
          ...ex,
          name: ex.name.trim(),
          sets: Math.max(1, Math.round(Number(ex.sets) || 1)),
          amount: Math.max(1, Math.round(Number(ex.amount) || 1)),
        })),
    };
    const exists = customWorkouts.some(workout => workout.id === cleaned.id);
    const next = exists ? customWorkouts.map(workout => workout.id === cleaned.id ? cleaned : workout) : [...customWorkouts, cleaned];
    await persistWorkouts(next, cleaned.id);
    setWorkoutDraft(cleaned);
    return cleaned;
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
    void persistWorkouts(next.length ? next : [fallback], fallback.id);
    setWorkoutDraft(fallback);
  };

  const startCustomWorkout = async () => {
    const workout = customWorkouts.find(item => item.id === selectedWorkoutId) ?? workoutDraft;
    if (!workout.exercises.some(exercise => exercise.exerciseId)) return;
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
  const currentWorkoutStep = sequenceActive && sequenceIndex >= 0 ? activeSequence.steps[sequenceIndex] : undefined;
  const nextWorkoutStep = sequenceActive ? activeSequence.steps[Math.max(0, sequenceIndex + 1)] : undefined;
  const upcomingWorkoutSteps = sequenceActive
    ? activeSequence.steps.slice(Math.max(0, sequenceIndex + 1), Math.max(0, sequenceIndex + 5))
    : [];
  const completedStepCount = sequenceActive ? Math.max(0, sequenceIndex) : done ? activeSequence.steps.length : 0;
  const totalStepCount = activeSequence.steps.length || 1;
  const workoutProgressPct = Math.min(100, Math.max(0, ((completedStepCount + (running ? 0.35 : 0)) / totalStepCount) * 100));
  const workoutStatus = done ? 'Complete' : running ? 'In progress' : currentWorkoutStep?.manual ? 'Waiting for reps' : sequenceActive ? 'Ready' : mode === 'stopwatch' ? 'Stopwatch' : 'Timer';
  const canShowWorkoutMode = mode === 'timer' && (sequenceActive || done || activeSequence.workout);
  const workoutInfoExercise = workoutInfoStep?.exerciseId ? exercises?.find(exercise => exercise.id === workoutInfoStep.exerciseId) : undefined;
  const openWorkoutInfo = (step?: TimerStep) => {
    if (!step?.exerciseId && !step?.exerciseName && !step?.label) return;
    setWorkoutInfoStep(step);
  };

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

      {canShowWorkoutMode && (
        <button
          onClick={event => { event.stopPropagation(); setWorkoutModeOpen(true); }}
          className="mb-3 w-full rounded-xl px-3 py-2.5 text-left transition-colors"
          style={{ background: '#1F2F46', color: '#fff' }}
        >
          <span className="block text-[10px] font-bold uppercase tracking-widest opacity-70">Workout mode</span>
          <span className="block text-sm font-bold leading-tight">{stepTitle(currentWorkoutStep, activeSequence.label)}</span>
          <span className="block text-[11px] opacity-75">{workoutStatus} · {completedStepCount}/{totalStepCount} steps</span>
        </button>
      )}

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
          <p className="mb-3 text-[10px] text-center text-stone-400">Each-side sets start right leg, then left leg.</p>

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
              <div className="mt-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#7E9B86' }}>Total: {workoutDurationSummary(customWorkouts.find(workout => workout.id === selectedWorkoutId)!)}</p>
                <p className="text-[10px] leading-snug text-stone-400 line-clamp-2">{workoutSummary(customWorkouts.find(workout => workout.id === selectedWorkoutId)!)}</p>
              </div>
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
          {running && remaining <= 5 && <p className="text-[11px] font-bold mt-0.5">Next cue in {remaining}</p>}
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
        {sequenceActive && sequenceIndex >= 0 && !done && <button onClick={event => { event.stopPropagation(); skipSegment(); }} className="rounded-lg text-xs font-semibold transition-colors" style={{ padding: '10px 10px', background: '#fef3c7', color: '#92400e' }}>Skip</button>}
        <button onClick={event => { event.stopPropagation(); reset(); }} className="rounded-lg text-xs font-semibold transition-colors" style={{ padding: '10px 12px', background: '#f5f5f4', color: '#78716c' }}>Reset</button>
      </div>
    </div>
  ) : null;

  const workoutMode = workoutModeOpen ? (
    <div className="fixed inset-0 z-[10002] box-border overflow-y-auto bg-[#101827] text-white" style={{ colorScheme: 'dark' }}>
      <div className="box-border flex min-h-dvh w-full flex-col" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingRight: 'max(1rem, env(safe-area-inset-right))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', paddingLeft: 'max(1rem, env(safe-area-inset-left))' }}>
        <div className="mx-auto box-border flex w-full max-w-3xl flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 pb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">{workoutStatus}</p>
              <h2 className="truncate text-lg font-extrabold tracking-tight sm:text-2xl">{activeSequence.label || 'Workout'}</h2>
            </div>
            <button onClick={() => setWorkoutModeOpen(false)} className="h-10 w-10 rounded-xl bg-white/10 text-2xl leading-none text-white/80">×</button>
          </div>

          <div className="mb-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#D9A94B] transition-all duration-500" style={{ width: `${workoutProgressPct}%` }} />
          </div>

          <section className="grid flex-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="box-border rounded-[2rem] bg-white/[0.08] p-5 shadow-2xl ring-1 ring-white/10 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => openWorkoutInfo(currentWorkoutStep)}
                  className="min-w-0 text-left"
                  disabled={!currentWorkoutStep}
                >
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#D9A94B]">Now</p>
                  <h1 className="mt-1 text-4xl font-black leading-none tracking-tight sm:text-6xl">{stepTitle(currentWorkoutStep, done ? 'Workout complete' : sequenceIndex < 0 ? 'Get ready' : 'Timer')}</h1>
                  {currentWorkoutStep && <p className="mt-2 text-xs font-bold uppercase tracking-widest text-white/35">Tap for details</p>}
                </button>
                <button
                  onClick={() => { void unlockAudio(); setBellOn(value => !value); }}
                  className="rounded-2xl px-3 py-2 text-xs font-bold"
                  style={{ background: bellOn ? '#E4ECE6' : 'rgb(255 255 255 / 0.1)', color: bellOn ? '#476653' : 'rgb(255 255 255 / 0.6)' }}
                >
                  {bellOn ? 'Sound on' : 'Muted'}
                </button>
              </div>

              <div className="my-8 flex w-full items-center justify-center">
                <div className="relative h-64 w-64 sm:h-80 sm:w-80">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="8" />
                    <circle cx="60" cy="60" r="54" fill="none" stroke={done ? '#7E9B86' : currentWorkoutStep?.kind === 'break' ? '#5B9BD5' : '#D9A94B'} strokeWidth="8" strokeLinecap="round" strokeDasharray={2 * Math.PI * 54} strokeDashoffset={(2 * Math.PI * 54) * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.9s linear' }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-6xl font-black tabular-nums tracking-tighter sm:text-7xl">{currentWorkoutStep?.manual ? 'REPS' : formatTime(shownSeconds)}</span>
                    <span className="mt-2 max-w-48 text-sm font-bold uppercase tracking-widest text-white/45">{stepDetail(currentWorkoutStep) || (done ? 'Saved to your log' : sequenceLabel)}</span>
                  </div>
                </div>
              </div>

              {(cue || sequenceLabel) && (
                <div className="rounded-2xl bg-[#E4ECE6] px-4 py-3 text-center text-[#283F30]">
                  {sequenceLabel && <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">{sequenceLabel}</p>}
                  {cue && <p className="text-lg font-extrabold leading-tight">{cue}</p>}
                  {running && remaining <= 5 && <p className="mt-1 text-sm font-bold">Next cue in {remaining}</p>}
                </div>
              )}

              <div className="mt-5 grid grid-cols-3 gap-2">
                <button onClick={() => { if (running) pauseTimer(); else start(); }} className="col-span-2 rounded-2xl py-4 text-base font-black text-white shadow-lg" style={{ background: running ? 'rgb(255 255 255 / 0.14)' : '#D9A94B' }}>
                  {running ? 'Pause' : currentWorkoutStep?.manual ? 'Done, next' : done && mode === 'timer' ? 'Restart' : 'Start'}
                </button>
                <button onClick={() => reset()} className="rounded-2xl bg-white/10 py-4 text-sm font-bold text-white/75">Reset</button>
                {sequenceActive && sequenceIndex >= 0 && !done && (
                  <button onClick={() => skipSegment()} className="col-span-3 rounded-2xl bg-white/10 py-3 text-sm font-bold text-white/75">Skip this step</button>
                )}
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => openWorkoutInfo(nextWorkoutStep)}
                disabled={!nextWorkoutStep}
                className="rounded-3xl bg-white/[0.08] p-4 text-left ring-1 ring-white/10 disabled:cursor-default"
              >
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">Up next</p>
                <h3 className="mt-2 text-2xl font-black leading-tight">{stepTitle(nextWorkoutStep, done ? 'Finished' : 'Nothing queued')}</h3>
                <p className="mt-1 text-sm font-semibold text-white/55">{stepDetail(nextWorkoutStep) || (done ? 'Workout complete' : 'Start a preset or custom workout')}</p>
              </button>

              <div className="rounded-3xl bg-white/[0.08] p-4 ring-1 ring-white/10">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">Remaining</p>
                  <span className="text-xs font-bold text-white/45">{Math.min(completedStepCount + 1, totalStepCount)}/{totalStepCount}</span>
                </div>
                <div className="space-y-2">
                  {upcomingWorkoutSteps.length ? upcomingWorkoutSteps.map((step, index) => (
                    <button key={`${step.label ?? step.cueAfter}-${index}`} type="button" onClick={() => openWorkoutInfo(step)} className="w-full rounded-2xl bg-white/[0.07] px-3 py-2 text-left">
                      <p className="truncate text-sm font-bold">{stepTitle(step)}</p>
                      <p className="truncate text-xs font-semibold text-white/45">{stepDetail(step)}</p>
                    </button>
                  )) : (
                    <p className="rounded-2xl bg-white/[0.07] px-3 py-4 text-center text-sm font-semibold text-white/45">{done ? 'All steps complete.' : 'Load a workout to see the queue.'}</p>
                  )}
                </div>
              </div>

              {showLogSection && (
                <div className="rounded-3xl bg-white p-4 text-stone-800">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Log timer</p>
                  {!logSaved ? (
                    <div className="mt-2 space-y-2">
                      <select value={logExerciseId} onChange={e => setLogExerciseId(e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" style={{ colorScheme: 'light' }}>
                        <option value="">Choose exercise...</option>
                        {exercises!.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                      </select>
                      <input value={logNoteText} onChange={e => setLogNoteText(e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" style={{ colorScheme: 'light' }} />
                      <button onClick={() => void handleLogNote()} disabled={!logExerciseId || !logNoteText} className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-40" style={{ background: '#7E9B86' }}>Save note</button>
                    </div>
                  ) : (
                    <p className="mt-2 rounded-xl bg-[#E4ECE6] px-3 py-2 text-sm font-bold text-[#476653]">Note saved.</p>
                  )}
                </div>
              )}
            </aside>
          </section>
        </div>
      </div>
      {workoutInfoStep && (
        <div className="fixed inset-0 z-[10003] flex items-end justify-center bg-black/55 px-3 py-3 backdrop-blur-sm sm:items-center" onClick={() => setWorkoutInfoStep(null)}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 text-stone-800 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{workoutInfoExercise?.categoryName ?? workoutInfoStep.kind}</p>
                <h3 className="mt-1 text-2xl font-black leading-tight text-stone-900">{workoutInfoExercise?.name ?? stepTitle(workoutInfoStep)}</h3>
                <p className="mt-1 text-sm font-semibold text-stone-500">{stepDetail(workoutInfoStep)}</p>
              </div>
              <button onClick={() => setWorkoutInfoStep(null)} className="h-9 w-9 flex-shrink-0 rounded-xl bg-stone-100 text-xl leading-none text-stone-500">×</button>
            </div>

            <div className="grid gap-3">
              {(workoutInfoExercise?.sets || workoutInfoStep.workNote) && (
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Prescription</p>
                  <p className="mt-1 text-sm font-bold text-stone-800">{workoutInfoStep.workNote ?? workoutInfoExercise?.sets}</p>
                  {workoutInfoExercise?.sets && workoutInfoStep.workNote && <p className="mt-1 text-xs font-semibold text-stone-400">{workoutInfoExercise.sets}</p>}
                </div>
              )}

              {workoutInfoExercise?.cue && (
                <div className="rounded-2xl bg-[#E4ECE6] p-3 text-[#283F30]">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-65">Cue</p>
                  <p className="mt-1 text-sm font-bold leading-snug">{workoutInfoExercise.cue}</p>
                </div>
              )}

              {!!workoutInfoExercise?.tips?.length && (
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Tips</p>
                  <ul className="mt-2 space-y-1.5">
                    {workoutInfoExercise.tips.slice(0, 6).map((tip, index) => (
                      <li key={`${tip}-${index}`} className="text-sm font-semibold leading-snug text-stone-600">{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!workoutInfoExercise?.cue && !workoutInfoExercise?.sets && !workoutInfoExercise?.tips?.length && (
                <p className="rounded-2xl bg-stone-50 p-4 text-sm font-semibold text-stone-500">No extra details saved for this step.</p>
              )}
            </div>
          </div>
        </div>
      )}
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
            <div className="rounded-xl px-3 py-2" style={{ background: '#E4ECE6', color: '#476653' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest">Estimated timer total</p>
              <p className="text-lg font-bold leading-tight">{workoutDurationSummary(workoutDraft)}</p>
            </div>
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
            <div className="rounded-xl border border-stone-100 bg-stone-50 p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Auto reorder</p>
                <div className="flex gap-1">
                  <button onClick={event => { event.stopPropagation(); setReorderText(currentWorkoutOrderJson()); }} disabled={!workoutDraft.exercises.length} className="rounded-lg px-2 py-1 text-[10px] font-bold disabled:opacity-40" style={{ background: '#E4ECE6', color: '#476653' }}>Fill JSON</button>
                  <button onClick={event => { event.stopPropagation(); downloadWorkoutOrderJson(); }} disabled={!workoutDraft.exercises.length} className="rounded-lg px-2 py-1 text-[10px] font-bold disabled:opacity-40" style={{ background: '#1F2F46', color: '#fff' }}>Download JSON</button>
                </div>
              </div>
              <textarea
                value={reorderText}
                onChange={event => setReorderText(event.target.value)}
                placeholder={'Paste order, one per line, or JSON: {"order":["Calf Stretch","Balance"]}'}
                rows={2}
                className="w-full resize-none rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs focus:outline-none"
                style={{ fontSize: 14, colorScheme: 'light' }}
              />
              <button onClick={event => { event.stopPropagation(); applyWorkoutReorderText(); }} disabled={!reorderText.trim()} className="mt-1.5 w-full rounded-lg py-1.5 text-xs font-bold text-white disabled:opacity-40" style={{ background: '#7E9B86' }}>Apply order</button>
            </div>
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
                  <select value={exercise.sides} onChange={event => updateWorkoutExercise(exercise.id, { sides: event.target.value as WorkoutSides })} className="rounded-lg border border-stone-200 bg-white px-1 py-1 text-xs font-semibold" style={{ colorScheme: 'light' }} aria-label="Pattern"><option value="both">both</option><option value="each">R/L</option><option value="inversion_eversion_both">R/L inv+ev</option></select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-stone-200 bg-[#F6F1E7] flex gap-2 flex-shrink-0">
          <button onClick={event => { event.stopPropagation(); void saveWorkoutDraft().then(() => setShowWorkoutBuilder(false)); }} className="flex-1 rounded-xl py-3 text-sm font-bold text-white" style={{ background: '#7E9B86' }}>Save workout</button>
          <button onClick={event => { event.stopPropagation(); void saveWorkoutDraft().then(saved => { setShowWorkoutBuilder(false); if (saved) void startSequencePreset(buildCustomSequence(saved)); }); }} className="flex-1 rounded-xl py-3 text-sm font-bold text-white" style={{ background: '#D9A94B' }}>Save & load</button>
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
      {mounted && workoutMode ? createPortal(workoutMode, document.body) : null}
      {mounted && builderSheet ? createPortal(builderSheet, document.body) : null}
    </>
  );
}
