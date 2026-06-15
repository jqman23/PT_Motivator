import { NextRequest, NextResponse } from 'next/server';
import { findExerciseDbGif } from '@/lib/exerciseDbGifLookup';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ gifUrl: null, error: 'missing query' });

  const found = await findExerciseDbGif({ name: q, imageSearch: q, cue: q });

  if (found?.gifUrl) {
    return NextResponse.json({
      gifUrl: found.gifUrl,
      source: 'exercisedb-oss',
      match: found.match,
      query: found.query,
      id: found.id,
    });
  }

  return NextResponse.json({ gifUrl: null, source: null, error: 'No ExerciseDB OSS media found.' });
}
