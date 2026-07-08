import { NextRequest, NextResponse } from 'next/server';
import { replaceTimerPushEvents, type TimerPushEvent } from '@/lib/push';

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
  return NextResponse.json({ ok: true, count: events.length });
}
