import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import {
  configureWebPush,
  getPushSubscriptions,
  getTimerPushEvents,
  removePushSubscription,
  saveTimerPushEvents,
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
      event.sent = true;
      sent += 1;
    } catch (err: unknown) {
      const statusCode = typeof err === 'object' && err && 'statusCode' in err ? Number((err as { statusCode?: number }).statusCode) : 0;
      const body = typeof err === 'object' && err && 'body' in err ? String((err as { body?: string }).body ?? '') : '';
      if (
        statusCode === 404
        || statusCode === 410
        || body.includes('VapidPkHashMismatch')
        || body.includes('BadJwtToken')
        || body.includes('BadVapidPublicKey')
      ) await removePushSubscription(event.endpoint);
      event.sent = true;
    }
  }

  await saveTimerPushEvents(events.filter(event => !event.sent || event.at > now - 10 * 60 * 1000));
  return NextResponse.json({ ok: true, due: due.length, sent });
}
