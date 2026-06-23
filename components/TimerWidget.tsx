'use client';

import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import QuickTimerWidget from './QuickTimerWidget';

type TimerWidgetProps = ComponentProps<typeof QuickTimerWidget>;

export default function TimerWidget(props: TimerWidgetProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const pendingTimeoutsRef = useRef<number[]>([]);
  const lastObservedSecondRef = useRef<number | null>(null);

  useEffect(() => {
    const getTimerPanel = () => {
      const soundButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[title="Sound on/off"]'));
      const soundButton = soundButtons[soundButtons.length - 1];
      return soundButton?.closest('div.fixed') as HTMLElement | null;
    };

    const clearPendingCountdown = () => {
      pendingTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
      pendingTimeoutsRef.current = [];
    };

    const soundIsOn = () => {
      const panel = getTimerPanel();
      const soundButton = panel?.querySelector<HTMLButtonElement>('button[title="Sound on/off"]');
      return !soundButton?.textContent?.includes('🔕');
    };

    const unlockAudio = async () => {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      return audioContextRef.current;
    };

    const playCountdownTone = async (secondsLeft: number) => {
      if (!soundIsOn()) return;
      const ctx = await unlockAudio();
      if (!ctx) return;
      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const length = 0.09;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(secondsLeft === 1 ? 1320 : 1040, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(secondsLeft === 1 ? 0.2 : 0.13, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + length + 0.02);
    };

    const clickStartButton = () => {
      const panel = getTimerPanel();
      const startButton = Array.from(panel?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find(button => button.textContent?.trim() === 'Start');
      startButton?.click();
    };

    const queuePresetCountdown = () => {
      clearPendingCountdown();
      lastObservedSecondRef.current = null;
      for (let secondsLeft = 5; secondsLeft >= 1; secondsLeft -= 1) {
        const delay = (5 - secondsLeft) * 1000;
        pendingTimeoutsRef.current.push(window.setTimeout(() => { void playCountdownTone(secondsLeft); }, delay));
      }
      pendingTimeoutsRef.current.push(window.setTimeout(() => {
        clickStartButton();
        pendingTimeoutsRef.current = [];
      }, 5000));
    };

    const handlePresetClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest('button');
      if (!(button instanceof HTMLButtonElement)) return;

      const label = button.textContent?.trim();
      if (/^(30|45|60)s$/.test(label ?? '')) {
        queuePresetCountdown();
        return;
      }

      if (label === 'Pause' || label === 'Reset') clearPendingCountdown();
    };

    const readRemainingSeconds = (panel: HTMLElement) => {
      const timeText = Array.from(panel.querySelectorAll('span'))
        .map(span => span.textContent?.trim() ?? '')
        .find(text => /^\d+:\d{2}$/.test(text));
      if (!timeText) return null;
      const [minutes, seconds] = timeText.split(':').map(Number);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
      return minutes * 60 + seconds;
    };

    const panelHasButton = (panel: HTMLElement, label: string) => (
      Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).some(button => button.textContent?.trim() === label)
    );

    const polishPanelText = (panel: HTMLElement) => {
      Array.from(panel.querySelectorAll<HTMLParagraphElement>('p')).forEach(paragraph => {
        const text = paragraph.textContent?.trim() ?? '';
        if (text === 'Set = side A · switch · side B') paragraph.remove();
        const startMatch = text.match(/^Stretch starts in ([1-5])$/);
        if (startMatch) paragraph.textContent = `Exercise starts in ${startMatch[1]}`;
      });
    };

    const syncCountdownBeeps = () => {
      const panel = getTimerPanel();
      if (!panel) {
        lastObservedSecondRef.current = null;
        return;
      }

      polishPanelText(panel);

      if (!panelHasButton(panel, 'Pause') || !panelHasButton(panel, 'min')) {
        lastObservedSecondRef.current = null;
        return;
      }

      const secondsLeft = readRemainingSeconds(panel);
      if (!secondsLeft || secondsLeft < 1 || secondsLeft > 5) {
        lastObservedSecondRef.current = null;
        return;
      }

      // Fallback guarantee: last five seconds beep both before exercise starts and before timer segments end.
      if (lastObservedSecondRef.current === secondsLeft) return;
      lastObservedSecondRef.current = secondsLeft;
      void playCountdownTone(secondsLeft);
    };

    document.addEventListener('click', handlePresetClick, true);
    const countdownBeepInterval = window.setInterval(syncCountdownBeeps, 250);

    return () => {
      clearPendingCountdown();
      window.clearInterval(countdownBeepInterval);
      document.removeEventListener('click', handlePresetClick, true);
    };
  }, []);

  return <QuickTimerWidget {...props} />;
}
