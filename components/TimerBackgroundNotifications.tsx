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

function notificationAllowed() {
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
  return cleaned;
}

export default function TimerBackgroundNotifications() {
  const notifiedKeysRef = useRef<Set<string>>(new Set());

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
      if (!notificationAllowed()) return;
      if (notifiedKeysRef.current.has(key)) return;
      notifiedKeysRef.current.add(key);
      saveNotifiedKeys(notifiedKeysRef.current);
      new Notification('PT Timer', {
        body,
        tag: 'pt-timer-status',
        renotify: true,
        silent: false,
      });
    };

    const checkTimer = () => {
      if (!document.hidden) return;
      const timer = readStoredTimer();
      if (!timer?.running || timer.mode !== 'timer' || !timer.endAt) return;
      if (timer.bellOn === false) return;
      if (Date.now() < timer.endAt) return;

      if (!timer.sequenceActive) {
        notifyOnce(`simple-done-${timer.endAt}`, 'Timer done');
        return;
      }

      const sequenceKey = timer.sequenceKey ?? 'one60';
      const steps = SEQUENCE_STEPS[sequenceKey] ?? SEQUENCE_STEPS.one60;
      const index = timer.sequenceIndex ?? 0;
      const cue = index < 0 ? 'Start' : (steps[index]?.cueAfter ?? timer.cue ?? 'Timer update');
      notifyOnce(`sequence-${sequenceKey}-${index}-${timer.endAt}-${cue}`, normalizeCue(cue));
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
