'use client';

import { useEffect, useRef } from 'react';

const TIMER_STORAGE_KEY = 'pt-quick-timer-state';

type StoredTimerState = {
  mode?: 'timer' | 'stopwatch';
  running?: boolean;
  done?: boolean;
  cue?: string;
  remaining?: number;
  sequenceActive?: boolean;
  sequenceIndex?: number;
  endAt?: number | null;
};

type Snapshot = {
  running: boolean;
  done: boolean;
  cue: string;
  remaining: number | null;
  hidden: boolean;
};

function supportsNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function getPermission() {
  if (!supportsNotifications()) return 'unsupported';
  return Notification.permission;
}

async function requestTimerNotificationPermission() {
  if (!supportsNotifications()) return;
  if (Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    // iOS/Safari can be picky; fail silently because in-app timer still works.
  }
}

function readStoredTimer(): StoredTimerState | null {
  try {
    const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredTimerState : null;
  } catch {
    return null;
  }
}

function readPanelSnapshot(): Snapshot {
  const soundButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button[title="Sound on/off"]')).at(-1);
  const panel = soundButton?.closest('div.fixed') as HTMLElement | null;
  const stored = readStoredTimer();
  const text = panel?.textContent ?? '';
  const pauseButton = panel ? Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).some(button => button.textContent?.trim() === 'Pause') : false;
  const cueText = Array.from(panel?.querySelectorAll('p') ?? [])
    .map(node => node.textContent?.trim() ?? '')
    .filter(Boolean)
    .find(value => /^(Start|Switch|End|Done|Start in \d+|.+starting|.+ready)$/i.test(value)) ?? '';
  const timeText = Array.from(panel?.querySelectorAll('span') ?? [])
    .map(node => node.textContent?.trim() ?? '')
    .find(value => /^\d+:\d{2}$/.test(value));
  const remaining = timeText
    ? timeText.split(':').map(Number).reduce((minutes, seconds) => minutes * 60 + seconds)
    : stored?.remaining ?? null;

  return {
    running: pauseButton || !!stored?.running,
    done: /\bDone\b|\bEnd\b/.test(text) || !!stored?.done,
    cue: stored?.cue || cueText,
    remaining: typeof remaining === 'number' && Number.isFinite(remaining) ? remaining : null,
    hidden: document.hidden,
  };
}

function notify(title: string, body?: string) {
  if (!supportsNotifications()) return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;

  try {
    const notification = new Notification(title, {
      body,
      tag: 'pt-timer-status',
      renotify: true,
      silent: false,
    });
    window.setTimeout(() => notification.close(), 7000);
  } catch {
    // Notification constructor may be unavailable in some embedded contexts.
  }
}

function formatRemaining(seconds: number | null) {
  if (seconds == null) return '';
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const rest = Math.max(0, seconds) % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function titleForCue(cue: string) {
  const clean = cue.trim();
  if (!clean) return '';
  if (/^start$/i.test(clean)) return 'Start next exercise';
  if (/^switch$/i.test(clean)) return 'Switch sides';
  if (/^(end|done)$/i.test(clean)) return 'Timer done';
  return clean;
}

export default function BackgroundTimerNotifications() {
  const lastSnapshotRef = useRef<Snapshot | null>(null);
  const lastNotificationKeyRef = useRef('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const maybeNotify = () => {
      const current = readPanelSnapshot();
      const previous = lastSnapshotRef.current;
      lastSnapshotRef.current = current;

      if (!current.hidden || getPermission() !== 'granted') return;

      let title = '';
      let body = '';

      if (previous && !previous.running && current.running) {
        title = 'PT timer started';
        body = formatRemaining(current.remaining);
      } else if (previous && previous.running && !current.running && !current.done) {
        title = 'PT timer paused';
        body = formatRemaining(current.remaining);
      } else if ((!previous?.done && current.done) || /^(done|end)$/i.test(current.cue)) {
        title = 'PT timer done';
        body = current.cue && !/^(done|end)$/i.test(current.cue) ? current.cue : 'Finished';
      } else if (previous && current.running && current.cue && current.cue !== previous.cue) {
        title = titleForCue(current.cue);
        body = formatRemaining(current.remaining);
      }

      if (!title) return;
      const key = `${title}|${body}`;
      if (lastNotificationKeyRef.current === key) return;
      lastNotificationKeyRef.current = key;
      notify(title, body || undefined);
    };

    const handleUserClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest('button');
      const label = button?.textContent?.trim();
      if (label === 'Start' || label === 'Restart' || label?.match(/^[123]set$/i)) {
        void requestTimerNotificationPermission();
      }
    };

    const handleVisibilityChange = () => {
      lastSnapshotRef.current = readPanelSnapshot();
    };

    document.addEventListener('click', handleUserClick, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const id = window.setInterval(maybeNotify, 1000);

    return () => {
      document.removeEventListener('click', handleUserClick, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(id);
    };
  }, []);

  return null;
}
