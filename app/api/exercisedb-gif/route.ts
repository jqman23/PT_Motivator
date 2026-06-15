import { NextRequest, NextResponse } from 'next/server';
import { findExerciseDbGif, findExerciseDbGifCandidates } from '@/lib/exerciseDbGifLookup';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const candidatesMode = req.nextUrl.searchParams.get('candidates') === '1';

  if (q.length < 2) return NextResponse.json({ gifUrl: null, error: 'missing query' });

  if (candidatesMode) {
    const candidates = await findExerciseDbGifCandidates({ name: q, imageSearch: q, cue: q }, 8);
    return NextResponse.json({ success: true, candidates });
  }

  const found = await findExerciseDbGif({ name: q, imageSearch: q, cue: q });

  if (found?.gifUrl) {
    return NextResponse.json({
      gifUrl: found.gifUrl,
      source: 'exercisedb-oss',
      match: found.match,
      query: found.query,
      id: found.id,
      score: found.score,
    });
  }

  return NextResponse.json({ gifUrl: null, source: null, error: 'No ExerciseDB OSS media found.' });
}
