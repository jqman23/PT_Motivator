import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';

export async function POST() {
  try {
    await initDb();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to init DB' }, { status: 500 });
  }
}
