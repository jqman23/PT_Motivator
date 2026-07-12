import { NextRequest, NextResponse } from 'next/server';
import {
  canScheduleTimerPushWithQStash,
  configureWebPush,
  getPushSubscriptions,
  getTimerPushEvents,
  removePushSubscription,
  saveTimerPushEvents,
  sendTimerPushNotification,
  shouldRemovePushSubscription,
} from '@/lib/push';

const SEND_AHEAD_MS = 5000;
const MAX_LATE_MS = 60 * 1000;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // QStash delivers each timer at its exact scheduled time. Keep the Vercel
  // cron as a fallback, but do not wake Neon every minute when QStash is live.
  if (canScheduleTimerPushWithQStash()) {
    return NextResponse.json({ ok: true, delegated: 'qstash' });
  }
  if (!configureWebPush()) {
    return NextResponse.json({ error: 'Missing VAPID keys' }, { status: 500 });
  }

  const now = Date.now();
  const [events, subscriptions] = await Promise.all([getTimerPushEvents(), getPushSubscriptions()]);
  const subscriptionsByEndpoint = new Map(subscriptions.map(subscription => [subscription.endpoint, subscription]));
  const due = events.filter(event => !event.sent && event.at <= now + SEND_AHEAD_MS && event.at >= now - MAX_LATE_MS);
  const expiredIds = new Set(events.filter(event => !event.sent && event.at < now - MAX_LATE_MS).map(event => `${event.endpoint}:${event.id}`));
  let sent = 0;

  for (const event of due) {
    const subscription = subscriptionsByEndpoint.get(event.endpoint);
    if (!subscription) continue;
    try {
      await sendTimerPushNotification(subscription, event);
      event.sent = true;
      sent += 1;
    } catch (err: unknown) {
      if (shouldRemovePushSubscription(err)) await removePushSubscription(event.endpoint);
      event.sent = true;
    }
  }

  await saveTimerPushEvents(events.filter(event => {
    if (expiredIds.has(`${event.endpoint}:${event.id}`)) return false;
    return !event.sent || event.at > now - 10 * 60 * 1000;
  }));
  return NextResponse.json({ ok: true, due: due.length, sent });
}
