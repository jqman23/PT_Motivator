import { NextRequest, NextResponse } from 'next/server';
import { getRecentNotes } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exerciseId = searchParams.get('exerciseId') ?? '';
  const beforeDate = searchParams.get('beforeDate') ?? '';
  if (!exerciseId || !beforeDate) {
    return NextResponse.json({ notes: [] });
  }
  try {
    const rows = await getRecentNotes(exerciseId, beforeDate);
    return NextResponse.json({ notes: rows.map(r => r.note) });
  } catch (err) {
    console.error('[recent-notes]', err);
    return NextResponse.json({ notes: [] });
  }
}
