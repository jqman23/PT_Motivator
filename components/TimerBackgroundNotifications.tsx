'use client';

import { useEffect, useRef } from 'react';

const TIMER_STORAGE_KEY = 'pt-quick-timer-state';
const NOTIFIED_STORAGE_KEY = 'pt-timer-hidden-notified-keys';
const PERMISSION_STORAGE_KEY = 'pt-timer-notifications-permission-asked';
const SWITCH_SECONDS = 15;
const BREAK_SECONDS = 30;

type SequenceKey = 'one60' | 'two60' | 'three60' | 'one30' | 'two30' | 'three30' | `custom-${string}`;
type StepKind = 'stretch' | 'switch' | 'break' | 'reps';

type TimerStep = {
  seconds: number;
  cueBefore?: string;
  cueAfter: string;
  kind: StepKind;
  label?: string;
  manual?: boolean;
  countdownToStretch?: boolean;
};

type StoredSequenceOption = {
  key: SequenceKey;
  label: string;
  steps: TimerStep[];
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
  customSequence?: StoredSequenceOption | null;
  endAt?: number | null;
};

type TimerSnapshot = {
  running: boolean;
  done: boolean;
  cue: string;
  endAt: number | null;
  sequenceKey: SequenceKey | null;
  sequenceIndex: number;
  customSequence: StoredSequenceOption | null;
  mode: 'timer' | 'stopwatch' | undefined;
};

type PushSubscriptionJson = PushSubscriptionJSON & { endpoint: string };
type ScheduledTimerEvent = { id: string; endpoint: string; at: number; body: string };

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
    customSequence: timer?.customSequence ?? null,
    mode: timer?.mode,
  };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function cueForStep(step?: TimerStep) {
  if (!step) return 'Timer update';
  if (step.cueBefore) return step.cueBefore;
  if (step.label) return `Start ${step.label}`;
  return normalizeCue(step.cueAfter || 'Timer update');
}

function notificationId(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash % 2147483647) || 1;
}

function scheduledEventsFor(timer: StoredTimerState, endpoint: string) {
  const now = Date.now();
  const events: ScheduledTimerEvent[] = [];
  if (timer.mode !== 'timer' || !timer.running || !timer.endAt || timer.bellOn === false) return events;

  if (!timer.sequenceActive) {
    events.push({ id: `simple-${timer.endAt}`, endpoint, at: timer.endAt, body: 'Timer done' });
    return events;
  }

  const sequenceKey = timer.sequenceKey ?? 'one60';
  const steps = timer.customSequence?.steps ?? SEQUENCE_STEPS[sequenceKey as keyof typeof SEQUENCE_STEPS] ?? SEQUENCE_STEPS.one60;
  let at = timer.endAt;
  let index = timer.sequenceIndex ?? 0;

  while (events.length < 40) {
    const current = steps[index];
    const nextIndex = index + 1;
    const next = steps[nextIndex];
    if (!current || !next) {
      events.push({ id: `done-${sequenceKey}-${at}`, endpoint, at, body: normalizeCue(current?.cueAfter || 'Timer done') });
      break;
    }

    events.push({ id: `step-${sequenceKey}-${nextIndex}-${at}`, endpoint, at, body: cueForStep(next) });
    if (next.manual) break;
    at += Math.max(1, next.seconds) * 1000;
    index = nextIndex;
    if (at < now - 5000) continue;
  }

  return events.filter(event => event.at > now - 5000);
}

export default function TimerBackgroundNotifications() {
  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const lastSnapshotRef = useRef<TimerSnapshot | null>(null);
  const pushEndpointRef = useRef<string | null>(null);
  const lastScheduledKeyRef = useRef('');

  const ensurePushSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null;
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;
    }
    if (Notification.permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.register('/sw.js');
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      pushEndpointRef.current = existing.endpoint;
      return existing;
    }

    const keyRes = await fetch('/api/push/public-key');
    const { publicKey } = await keyRes.json();
    if (!publicKey) return null;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    pushEndpointRef.current = subscription.endpoint;
    return subscription;
  };

  const schedulePushNotifications = async () => {
    const timer = readStoredTimer();
    if (!timer?.running || timer.mode !== 'timer') return;
    if (await scheduleNativeNotifications(timer)) return;
    const subscription = await ensurePushSubscription();
    const json = subscription?.toJSON() as PushSubscriptionJson | undefined;
    const endpoint = subscription?.endpoint ?? json?.endpoint ?? pushEndpointRef.current;
    if (!endpoint) return;
    if (json?.endpoint) {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
    }
    const events = scheduledEventsFor(timer, endpoint);
    const scheduleKey = JSON.stringify(events.map(event => [event.id, event.at, event.body]));
    if (scheduleKey === lastScheduledKeyRef.current) return;
    lastScheduledKeyRef.current = scheduleKey;
    await fetch('/api/timer-push/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, events }),
    });
  };

  const scheduleNativeNotifications = async (timer: StoredTimerState) => {
    try {
      const [{ Capacitor }, { LocalNotifications }] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/local-notifications'),
      ]);
      if (!Capacitor.isNativePlatform()) return false;
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') return false;
      const endpoint = 'native-local';
      const events = scheduledEventsFor(timer, endpoint);
      const pending = await LocalNotifications.getPending();
      const timerPending = pending.notifications.filter(item => item.extra?.ptTimer === true);
      if (timerPending.length) await LocalNotifications.cancel({ notifications: timerPending.map(item => ({ id: item.id })) });
      if (!events.length) return true;
      await LocalNotifications.schedule({
        notifications: events.map(event => ({
          id: notificationId(event.id),
          title: 'PT Timer',
          body: event.body,
          schedule: { at: new Date(event.at) },
          sound: 'default',
          extra: { ptTimer: true },
        })),
      });
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    notifiedKeysRef.current = loadNotifiedKeys();

    const askPermissionFromTimerGesture = () => {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return;
      if (localStorage.getItem(PERMISSION_STORAGE_KEY) === 'true') return;
      localStorage.setItem(PERMISSION_STORAGE_KEY, 'true');
      void ensurePushSubscription();
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
        || label === 'Load'
        || label === 'Next'
        || /^\d+s$/.test(label)
        || label.includes('set');
      if (isTimerButton) {
        askPermissionFromTimerGesture();
        window.setTimeout(() => { void schedulePushNotifications(); }, 300);
      }
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
      if (current.running) void schedulePushNotifications();

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
      const steps = current.customSequence?.steps ?? SEQUENCE_STEPS[sequenceKey as keyof typeof SEQUENCE_STEPS] ?? SEQUENCE_STEPS.one60;
      const currentStep = current.sequenceIndex < 0 ? steps[0] : steps[current.sequenceIndex];
      const cue = current.sequenceIndex < 0
        ? currentStep?.cueBefore ?? (currentStep?.label ? `Start ${currentStep.label.split(' set ')[0]}` : 'Start')
        : (currentStep?.cueBefore ?? currentStep?.cueAfter ?? currentStep?.label ?? current.cue ?? 'Timer update');
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
