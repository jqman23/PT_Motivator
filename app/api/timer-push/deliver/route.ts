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

const MAX_LATE_MS = 60 * 1000;

function authorized(req: NextRequest) {
  const secret = process.env.QSTASH_TIMER_SECRET || process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!configureWebPush()) return NextResponse.json({ error: 'Missing VAPID keys' }, { status: 500 });

  const body = await req.json().catch(() => ({})) as { endpoint?: string; id?: string };
  if (!body.endpoint || !body.id) return NextResponse.json({ error: 'Missing timer event' }, { status: 400 });

  const [events, subscriptions] = await Promise.all([getTimerPushEvents(), getPushSubscriptions()]);
  const index = events.findIndex(event => event.endpoint === body.endpoint && event.id === body.id);
  const event = index >= 0 ? events[index] : null;
  if (!event) return NextResponse.json({ ok: true, skipped: 'not-found' });
  if (event.sent) return NextResponse.json({ ok: true, skipped: 'already-sent' });
  if (event.at < Date.now() - MAX_LATE_MS) {
    await saveTimerPushEvents(events.filter(item => !(item.endpoint === event.endpoint && item.id === event.id)));
    return NextResponse.json({ ok: true, skipped: 'expired' });
  }

  const subscription = subscriptions.find(item => item.endpoint === event.endpoint);
  if (!subscription) return NextResponse.json({ ok: true, skipped: 'missing-subscription' });

  try {
    await sendTimerPushNotification(subscription, event);
    const latest = await getTimerPushEvents();
    await saveTimerPushEvents(latest.map(item => item.endpoint === event.endpoint && item.id === event.id ? { ...item, sent: true } : item));
  } catch (err: unknown) {
    if (shouldRemovePushSubscription(err)) await removePushSubscription(event.endpoint);
    throw err;
  } finally {
    const latest = await getTimerPushEvents();
    await saveTimerPushEvents(latest.filter(item => !item.sent || item.at > Date.now() - 10 * 60 * 1000));
  }

  return NextResponse.json({ ok: true, sent: 1 });
}
