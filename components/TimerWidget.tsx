'use client';

import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import QuickTimerWidget from './QuickTimerWidget';

type TimerWidgetProps = ComponentProps<typeof QuickTimerWidget>;

export default function TimerWidget(props: TimerWidgetProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const pendingTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    const clearPendingCountdown = () => {
      pendingTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
      pendingTimeoutsRef.current = [];
    };

    const soundIsOn = () => {
      const soundButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[title="Sound on/off"]'));
      const soundButton = soundButtons[soundButtons.length - 1];
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
      const startButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find(button => button.textContent?.trim() === 'Start');
      startButton?.click();
    };

    const queuePresetCountdown = () => {
      clearPendingCountdown();
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

    document.addEventListener('click', handlePresetClick, true);
    return () => {
      clearPendingCountdown();
      document.removeEventListener('click', handlePresetClick, true);
    };
  }, []);

  return <QuickTimerWidget {...props} />;
}
