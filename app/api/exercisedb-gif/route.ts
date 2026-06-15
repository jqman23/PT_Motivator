import { NextRequest, NextResponse } from 'next/server';
import { findCuratedGif } from '@/lib/gifMap';

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ gifUrl: null, error: 'missing query' });

  const curated = findCuratedGif(q);
  if (curated) return NextResponse.json(curated);

  return NextResponse.json({
    gifUrl: null,
    source: null,
    error: 'No curated GIF yet. Add this exercise to lib/gifMap.ts.',
  });
}
