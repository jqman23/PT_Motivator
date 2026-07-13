import { NextRequest, NextResponse } from 'next/server';
import { getRecentNotes } from '@/lib/db';
import { stripSecretNotes } from '@/lib/secretNotes';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exerciseId = searchParams.get('exerciseId') ?? '';
  const beforeDate = searchParams.get('beforeDate') ?? '';
  if (!exerciseId || !beforeDate) {
    return NextResponse.json({ notes: [] });
  }
  try {
    const rows = await getRecentNotes(exerciseId, beforeDate);
    return NextResponse.json({ notes: rows.map(r => stripSecretNotes(r.note)).filter(note => note.trim()) });
  } catch (err) {
    console.error('[recent-notes]', err);
    return NextResponse.json({ notes: [] });
  }
}
