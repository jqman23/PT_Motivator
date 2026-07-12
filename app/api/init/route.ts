import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.QSTASH_TIMER_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await initDb();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to init DB' }, { status: 500 });
  }
}
