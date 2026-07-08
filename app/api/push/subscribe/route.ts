import { NextRequest, NextResponse } from 'next/server';
import { savePushSubscription, type StoredPushSubscription } from '@/lib/push';

export async function POST(req: NextRequest) {
  const subscription = await req.json() as StoredPushSubscription;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
  }
  await savePushSubscription(subscription);
  return NextResponse.json({ ok: true, endpoint: subscription.endpoint });
}
