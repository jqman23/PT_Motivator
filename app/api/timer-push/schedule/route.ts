import { NextRequest, NextResponse } from 'next/server';
import {
  configureWebPush,
  canScheduleTimerPushWithQStash,
  getPushSubscriptions,
  getTimerPushEvents,
  removePushSubscription,
  replaceTimerPushEvents,
  scheduleTimerPushWithQStash,
  saveTimerPushEvents,
  sendTimerPushNotification,
  shouldRemovePushSubscription,
  type TimerPushEvent,
} from '@/lib/push';

export const maxDuration = 60;

const SOON_WINDOW_MS = 55 * 1000;
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
  if (!soon.length) return { sent: 0 };

  const claimedIds = new Set(soon.map(event => event.id));
  await saveTimerPushEvents(events.map(event => (
    claimedIds.has(event.id) ? { ...event, sent: true } : event
  )));

  let sent = 0;

  for (const event of soon) {
    const waitMs = event.at - Date.now() - SEND_SLOP_MS;
    if (waitMs > 0) await sleep(waitMs);
    const latest = await getTimerPushEvents();
    const stillScheduled = latest.some(item => item.endpoint === endpoint && item.id === event.id && item.sent);
    if (!stillScheduled) continue;
    try {
      await sendTimerPushNotification(subscription, event);
      sent += 1;
    } catch (err: unknown) {
      if (shouldRemovePushSubscription(err)) await removePushSubscription(endpoint);
    }
  }

  const latest = await getTimerPushEvents();
  await saveTimerPushEvents(latest.filter(event => !event.sent || event.at > Date.now() - 10 * 60 * 1000));
  return { sent };
}

async function scheduleEndpointEventsWithQStash(endpoint: string, events: TimerPushEvent[]) {
  if (!canScheduleTimerPushWithQStash() || !events.length) return { enabled: false, scheduled: 0 };

  const stored = await getTimerPushEvents();
  const pendingByKey = new Map(
    stored
      .filter(event => event.endpoint === endpoint && !event.sent)
      .map(event => [`${event.endpoint}:${event.id}`, event])
  );
  let scheduled = 0;

  for (const event of events) {
    const key = `${event.endpoint}:${event.id}`;
    const current = pendingByKey.get(key);
    if (current?.qstashMessageId) continue;
    const messageId = await scheduleTimerPushWithQStash(event).catch(error => {
      console.error('[timer-push/qstash]', error);
      return null;
    });
    if (!messageId) continue;
    pendingByKey.set(key, { ...event, qstashMessageId: messageId });
    scheduled += 1;
  }

  if (scheduled > 0) {
    const latest = await getTimerPushEvents();
    const next = latest.map(event => {
      const scheduledEvent = pendingByKey.get(`${event.endpoint}:${event.id}`);
      return scheduledEvent ? { ...event, qstashMessageId: scheduledEvent.qstashMessageId } : event;
    });
    await saveTimerPushEvents(next);
  }

  return { enabled: scheduled > 0, scheduled };
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
  const qstash = await scheduleEndpointEventsWithQStash(body.endpoint, events);
  const soon = !qstash.enabled && events.some(event => event.at <= now + SOON_WINDOW_MS);
  const immediate = soon ? await sendEndpointEventsSoon(body.endpoint) : { sent: 0 };
  return NextResponse.json({ ok: true, count: events.length, qstash, sentSoon: immediate.sent });
}
