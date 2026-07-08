import { NextRequest, NextResponse } from 'next/server';
import {
  configureWebPush,
  getPushSubscriptions,
  getTimerPushEvents,
  removePushSubscription,
  replaceTimerPushEvents,
  saveTimerPushEvents,
  sendTimerPushNotification,
  shouldRemovePushSubscription,
  type TimerPushEvent,
} from '@/lib/push';

export const maxDuration = 60;

const SOON_WINDOW_MS = 61 * 1000;
const SEND_SLOP_MS = 500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendEndpointEventsSoon(endpoint: string) {
  if (!configureWebPush()) return { sent: 0 };

  const now = Date.now();
  const [events, subscriptions] = await Promise.all([getTimerPushEvents(), getPushSubscriptions()]);
  const subscription = subscriptions.find(item => item.endpoint === endpoint);
  if (!subscription) return { sent: 0 };

  const soon = events
    .filter(event => !event.sent && event.endpoint === endpoint && event.at <= now + SOON_WINDOW_MS)
    .sort((a, b) => a.at - b.at);
  let sent = 0;

  for (const event of soon) {
    const waitMs = event.at - Date.now() - SEND_SLOP_MS;
    if (waitMs > 0) await sleep(waitMs);
    try {
      await sendTimerPushNotification(subscription, event);
      event.sent = true;
      sent += 1;
    } catch (err: unknown) {
      if (shouldRemovePushSubscription(err)) await removePushSubscription(endpoint);
      event.sent = true;
    }
  }

  const sentIds = new Set(soon.filter(event => event.sent).map(event => event.id));
  const next = events.map(event => sentIds.has(event.id) ? { ...event, sent: true } : event);
  await saveTimerPushEvents(next.filter(event => !event.sent || event.at > Date.now() - 10 * 60 * 1000));
  return { sent };
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { endpoint?: string; events?: TimerPushEvent[] };
  if (!body.endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  const now = Date.now();
  const events = Array.isArray(body.events)
    ? body.events
        .filter(event => event.at > now - 5000 && event.body && event.endpoint === body.endpoint)
        .map(event => ({ ...event, sent: false }))
        .slice(0, 40)
    : [];
  await replaceTimerPushEvents(body.endpoint, events);
  const soon = events.some(event => event.at <= now + SOON_WINDOW_MS);
  const immediate = soon ? await sendEndpointEventsSoon(body.endpoint) : { sent: 0 };
  return NextResponse.json({ ok: true, count: events.length, sentSoon: immediate.sent });
}
