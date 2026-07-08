import webpush, { type PushSubscription } from 'web-push';
import { getConfig, setConfig } from '@/lib/db';

export type StoredPushSubscription = PushSubscription & {
  endpoint: string;
  updatedAt?: string;
};

export type TimerPushEvent = {
  id: string;
  endpoint: string;
  at: number;
  body: string;
  sent?: boolean;
};

const PUSH_SUBSCRIPTIONS_KEY = 'pushSubscriptions';
const TIMER_PUSH_EVENTS_KEY = 'timerPushEvents';

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
}

export function configureWebPush() {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:pt-motivator@example.com', publicKey, privateKey);
  return true;
}

export async function getPushSubscriptions(): Promise<StoredPushSubscription[]> {
  const value = await getConfig(PUSH_SUBSCRIPTIONS_KEY);
  return Array.isArray(value) ? value as StoredPushSubscription[] : [];
}

export async function savePushSubscription(subscription: StoredPushSubscription) {
  const subscriptions = await getPushSubscriptions();
  const next = [
    ...subscriptions.filter(item => item.endpoint !== subscription.endpoint),
    { ...subscription, updatedAt: new Date().toISOString() },
  ].slice(-20);
  await setConfig(PUSH_SUBSCRIPTIONS_KEY, next);
}

export async function removePushSubscription(endpoint: string) {
  const subscriptions = await getPushSubscriptions();
  await setConfig(PUSH_SUBSCRIPTIONS_KEY, subscriptions.filter(item => item.endpoint !== endpoint));
}

export async function getTimerPushEvents(): Promise<TimerPushEvent[]> {
  const value = await getConfig(TIMER_PUSH_EVENTS_KEY);
  return Array.isArray(value) ? value as TimerPushEvent[] : [];
}

export async function replaceTimerPushEvents(endpoint: string, events: TimerPushEvent[]) {
  const existing = await getTimerPushEvents();
  const next = [...existing.filter(event => event.endpoint !== endpoint), ...events].slice(-200);
  await setConfig(TIMER_PUSH_EVENTS_KEY, next);
}

export async function saveTimerPushEvents(events: TimerPushEvent[]) {
  await setConfig(TIMER_PUSH_EVENTS_KEY, events.slice(-200));
}
