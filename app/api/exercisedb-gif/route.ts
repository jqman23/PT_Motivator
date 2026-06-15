import { NextRequest, NextResponse } from 'next/server';

type ExerciseDbItem = {
  id?: string;
  name?: string;
  gifUrl?: string;
  target?: string;
  bodyPart?: string;
  equipment?: string;
};

function scoreMatch(query: string, item: ExerciseDbItem) {
  const q = query.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const n = String(item.name ?? '').toLowerCase();
  let score = 0;
  for (const word of q.split(' ')) {
    if (word.length > 2 && n.includes(word)) score += 1;
  }
  if (n === q) score += 10;
  if (n.includes(q)) score += 5;
  return score;
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ gifUrl: null });

  const apiKey = process.env.EXERCISEDB_RAPIDAPI_KEY;
  if (!apiKey) return NextResponse.json({ gifUrl: null, noKey: true });

  try {
    const res = await fetch(
      `https://exercisedb.p.rapidapi.com/exercises/name/${encodeURIComponent(q)}?limit=10&offset=0`,
      {
        headers: {
          'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
        },
        next: { revalidate: 86400 },
      }
    );

    if (!res.ok) return NextResponse.json({ gifUrl: null, error: `ExerciseDB ${res.status}` });

    const items = (await res.json()) as ExerciseDbItem[];
    const best = items
      .filter(item => item.gifUrl)
      .sort((a, b) => scoreMatch(q, b) - scoreMatch(q, a))[0];

    return NextResponse.json({ gifUrl: best?.gifUrl ?? null, match: best ?? null });
  } catch {
    return NextResponse.json({ gifUrl: null, error: 'ExerciseDB fetch failed' });
  }
}
