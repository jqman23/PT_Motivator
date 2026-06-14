import { NextRequest, NextResponse } from 'next/server';
import { getLogForRange, upsertLog, deleteLogForDate } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  }
  try {
    const rows = await getLogForRange(start, end);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  try {
    await deleteLogForDate(date);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { date, exerciseId, completed } = await req.json();
    if (!date || !exerciseId || completed === undefined) {
      return NextResponse.json({ error: 'date, exerciseId, completed required' }, { status: 400 });
    }
    await upsertLog(date, exerciseId, completed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
