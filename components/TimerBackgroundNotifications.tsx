'use client';

import { useEffect, useRef } from 'react';

const TIMER_STORAGE_KEY = 'pt-quick-timer-state';
const NOTIFIED_STORAGE_KEY = 'pt-timer-hidden-notified-keys';
const PERMISSION_STORAGE_KEY = 'pt-timer-notifications-permission-asked';
const SWITCH_SECONDS = 15;
const BREAK_SECONDS = 30;

type SequenceKey = 'one60' | 'two60' | 'three60' | 'one30' | 'two30' | 'three30';
type StepKind = 'stretch' | 'switch' | 'break';

type TimerStep = {
  seconds: number;
  cueAfter: string;
  kind: StepKind;
  countdownToStretch?: boolean;
};

type StoredTimerState = {
  mode?: 'timer' | 'stopwatch';
  duration?: number;
  remaining?: number;
  running?: boolean;
  done?: boolean;
  bellOn?: boolean;
  cue?: string;
  sequenceActive?: boolean;
  sequenceIndex?: number;
  sequenceKey?: SequenceKey | null;
  endAt?: number | null;
};

type TimerSnapshot = {
  running: boolean;
  done: boolean;
  cue: string;
  endAt: number | null;
  sequenceKey: SequenceKey | null;
  sequenceIndex: number;
  mode: 'timer' | 'stopwatch' | undefined;
};

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

const SEQUENCE_STEPS: Record<SequenceKey, TimerStep[]> = {
  one60: buildSequence(1, 60),
  two60: buildSequence(2, 60),
  three60: buildSequence(3, 60),
  one30: buildSequence(1, 30),
  two30: buildSequence(2, 30),
  three30: buildSequence(3, 30),
};

function readStoredTimer(): StoredTimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredTimerState : null;
  } catch {
    return null;
  }
}

function loadNotifiedKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_STORAGE_KEY) || '[]') as string[]);
  } catch {
    return new Set<string>();
  }
}

function saveNotifiedKeys(keys: Set<string>) {
  localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(Array.from(keys).slice(-80)));
}

function canNotifyHidden() {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && document.hidden
    && 'Notification' in window
    && Notification.permission === 'granted';
}

function normalizeCue(cue: string) {
  const cleaned = cue.trim();
  if (!cleaned) return '';
  if (/^end$/i.test(cleaned)) return 'Timer done';
  if (/^done$/i.test(cleaned)) return 'Timer done';
  if (/^start$/i.test(cleaned)) return 'Start next exercise';
  if (/^switch$/i.test(cleaned)) return 'Switch sides';
  if (/break/i.test(cleaned)) return cleaned;
  return cleaned;
}

function snapshot(timer: StoredTimerState | null): TimerSnapshot {
  return {
    running: !!timer?.running,
    done: !!timer?.done,
    cue: timer?.cue ?? '',
    endAt: timer?.endAt ?? null,
    sequenceKey: timer?.sequenceKey ?? null,
    sequenceIndex: timer?.sequenceIndex ?? 0,
    mode: timer?.mode,
  };
}

export default function TimerBackgroundNotifications() {
  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const lastSnapshotRef = useRef<TimerSnapshot | null>(null);

  useEffect(() => {
    notifiedKeysRef.current = loadNotifiedKeys();

    const askPermissionFromTimerGesture = () => {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return;
      if (localStorage.getItem(PERMISSION_STORAGE_KEY) === 'true') return;
      localStorage.setItem(PERMISSION_STORAGE_KEY, 'true');
      void Notification.requestPermission();
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest('button');
      if (!button) return;
      const label = button.textContent?.trim() ?? '';
      const isTimerButton = button.title === 'Quick timer'
        || button.title === 'Sound on/off'
        || label === 'Start'
        || label === 'Restart'
        || label === 'Pause'
        || label === 'Reset'
        || /^\d+s$/.test(label)
        || label.includes('set');
      if (isTimerButton) askPermissionFromTimerGesture();
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  useEffect(() => {
    const notifyOnce = (key: string, body: string) => {
      if (!canNotifyHidden()) return;
      if (notifiedKeysRef.current.has(key)) return;
      notifiedKeysRef.current.add(key);
      saveNotifiedKeys(notifiedKeysRef.current);
      const note = new Notification('PT Timer', {
        body,
        tag: 'pt-timer-status',
        silent: false,
      });
      window.setTimeout(() => note.close(), 8000);
    };

    const checkTimer = () => {
      const timer = readStoredTimer();
      const current = snapshot(timer);
      const previous = lastSnapshotRef.current;
      lastSnapshotRef.current = current;

      // Never notify while the app is foregrounded. In-app voice/beeps own that case.
      if (!document.hidden) return;
      if (timer?.bellOn === false) return;
      if (current.mode !== 'timer') return;

      if (previous && !previous.running && current.running) {
        notifyOnce(`started-${current.endAt ?? Date.now()}`, 'Timer started');
      }

      if (previous && previous.running && !current.running && !current.done) {
        notifyOnce(`paused-${previous.endAt ?? Date.now()}`, 'Timer paused');
      }

      if (current.done) {
        notifyOnce(`done-${current.endAt ?? current.cue}`, normalizeCue(current.cue || 'Done'));
        return;
      }

      if (!current.running || !current.endAt) return;
      if (Date.now() < current.endAt) return;

      if (!timer?.sequenceActive) {
        notifyOnce(`simple-done-${current.endAt}`, 'Timer done');
        return;
      }

      const sequenceKey = current.sequenceKey ?? 'one60';
      const steps = SEQUENCE_STEPS[sequenceKey] ?? SEQUENCE_STEPS.one60;
      const cue = current.sequenceIndex < 0 ? 'Start' : (steps[current.sequenceIndex]?.cueAfter ?? current.cue ?? 'Timer update');
      notifyOnce(`sequence-${sequenceKey}-${current.sequenceIndex}-${current.endAt}-${cue}`, normalizeCue(cue));
    };

    const interval = window.setInterval(checkTimer, 1000);
    document.addEventListener('visibilitychange', checkTimer);
    window.addEventListener('focus', checkTimer);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', checkTimer);
      window.removeEventListener('focus', checkTimer);
    };
  }, []);

  return null;
}
