import { NextRequest, NextResponse } from 'next/server';
import { findExerciseDbGif } from '@/lib/exerciseDbGifLookup';

type InputExercise = {
  id: string;
  name?: string;
  cue?: string;
  imageSearch?: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const exercises: InputExercise[] = Array.isArray(body?.exercises) ? body.exercises : [];

  const updates: Record<string, string> = {};
  const debug: { id: string; name?: string; status: string; query?: string; match?: string | null; gifUrl?: string }[] = [];

  for (const ex of exercises) {
    const found = await findExerciseDbGif(ex);

    if (found?.gifUrl) {
      updates[ex.id] = found.gifUrl;
      debug.push({
        id: ex.id,
        name: ex.name,
        status: 'filled',
        query: found.query,
        match: found.match,
        gifUrl: found.gifUrl,
      });
    } else {
      debug.push({ id: ex.id, name: ex.name, status: 'not_found' });
    }
  }

  return NextResponse.json({
    success: true,
    checked: exercises.length,
    filled: Object.keys(updates).length,
    updates,
    debug,
  });
}
