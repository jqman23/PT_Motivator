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
  qstashMessageId?: string;
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
  const existingById = new Map(existing.map(event => [`${event.endpoint}:${event.id}`, event]));
  const preserved = events.map(event => {
    const current = existingById.get(`${event.endpoint}:${event.id}`);
    return {
      ...event,
      sent: current?.sent ? true : event.sent,
      qstashMessageId: current?.qstashMessageId,
    };
  });
  const next = [...existing.filter(event => event.endpoint !== endpoint), ...preserved].slice(-200);
  await setConfig(TIMER_PUSH_EVENTS_KEY, next);
}

export async function saveTimerPushEvents(events: TimerPushEvent[]) {
  await setConfig(TIMER_PUSH_EVENTS_KEY, events.slice(-200));
}

function appBaseUrl() {
  const explicit = process.env.QSTASH_TIMER_BASE_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL
    || '';
  if (!explicit) return '';
  return explicit.startsWith('http://') || explicit.startsWith('https://') ? explicit : `https://${explicit}`;
}

export function canScheduleTimerPushWithQStash() {
  return !!(process.env.QSTASH_TOKEN && appBaseUrl() && (process.env.QSTASH_TIMER_SECRET || process.env.CRON_SECRET));
}

export async function scheduleTimerPushWithQStash(event: TimerPushEvent) {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = appBaseUrl();
  const deliverySecret = process.env.QSTASH_TIMER_SECRET || process.env.CRON_SECRET || '';
  if (!token || !baseUrl || !deliverySecret) return null;

  const delaySeconds = Math.max(0, Math.ceil((event.at - Date.now()) / 1000));
  const destination = `${baseUrl.replace(/\/$/, '')}/api/timer-push/deliver`;
  const res = await fetch(`https://qstash.upstash.io/v2/publish/${destination}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': `${delaySeconds}s`,
      'Upstash-Retries': '2',
      'Upstash-Forward-Authorization': `Bearer ${deliverySecret}`,
    },
    body: JSON.stringify({ endpoint: event.endpoint, id: event.id }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`QStash schedule failed (${res.status}): ${text}`);
  }

  const data = await res.json().catch(() => ({})) as { messageId?: string };
  return data.messageId ?? null;
}

export async function sendTimerPushNotification(subscription: PushSubscription, event: TimerPushEvent) {
  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: 'PT Timer',
      body: event.body,
      tag: event.id,
      requireInteraction: true,
      url: '/',
    }),
    {
      TTL: 5 * 60,
      urgency: 'high',
    },
  );
}

export function shouldRemovePushSubscription(err: unknown) {
  const statusCode = typeof err === 'object' && err && 'statusCode' in err ? Number((err as { statusCode?: number }).statusCode) : 0;
  const body = typeof err === 'object' && err && 'body' in err ? String((err as { body?: string }).body ?? '') : '';
  return statusCode === 404
    || statusCode === 410
    || body.includes('VapidPkHashMismatch')
    || body.includes('BadJwtToken')
    || body.includes('BadVapidPublicKey');
}
