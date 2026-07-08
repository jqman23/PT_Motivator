import { NextRequest, NextResponse } from 'next/server';
import {
  configureWebPush,
  getPushSubscriptions,
  getTimerPushEvents,
  removePushSubscription,
  saveTimerPushEvents,
  sendTimerPushNotification,
  shouldRemovePushSubscription,
} from '@/lib/push';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!configureWebPush()) {
    return NextResponse.json({ error: 'Missing VAPID keys' }, { status: 500 });
  }

  const now = Date.now();
  const [events, subscriptions] = await Promise.all([getTimerPushEvents(), getPushSubscriptions()]);
  const subscriptionsByEndpoint = new Map(subscriptions.map(subscription => [subscription.endpoint, subscription]));
  const due = events.filter(event => !event.sent && event.at <= now + 5000);
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

  await saveTimerPushEvents(events.filter(event => !event.sent || event.at > now - 10 * 60 * 1000));
  return NextResponse.json({ ok: true, due: due.length, sent });
}
