import { NextRequest, NextResponse } from 'next/server';
import { getLogForRange, upsertLog, deleteLogForDate } from '@/lib/db';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validRange(start: string, end: string) {
  if (!DATE_PATTERN.test(start) || !DATE_PATTERN.test(end) || start > end) return false;
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 <= 400;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!start || !end || !validRange(start, end)) {
    return NextResponse.json({ error: 'valid start and end dates required' }, { status: 400 });
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
    if (!DATE_PATTERN.test(String(date ?? '')) || !exerciseId || typeof completed !== 'boolean') {
      return NextResponse.json({ error: 'date, exerciseId, completed required' }, { status: 400 });
    }
    await upsertLog(date, exerciseId, completed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
