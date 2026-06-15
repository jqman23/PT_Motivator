import { NextRequest, NextResponse } from 'next/server';

type ExerciseDbItem = { id?: string; name?: string; gifUrl?: string; target?: string; bodyPart?: string; equipment?: string };

function clean(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreMatch(query: string, item: ExerciseDbItem) {
  const q = clean(query);
  const n = clean(String(item.name ?? ''));
  let score = 0;
  if (n === q) score += 100;
  if (n.includes(q)) score += 50;
  for (const word of q.split(' ')) if (word.length > 2 && n.includes(word)) score += 5;
  return score;
}

async function rapid(path: string, apiKey: string) {
  const res = await fetch(`https://exercisedb.p.rapidapi.com${path}`, {
    headers: {
      'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  return await res.json();
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ gifUrl: null });

  const apiKey = process.env.EXERCISEDB_RAPIDAPI_KEY;
  if (!apiKey) return NextResponse.json({ gifUrl: null, noKey: true });

  try {
    let items = await rapid(`/exercises/name/${encodeURIComponent(q)}?limit=20&offset=0`, apiKey) as ExerciseDbItem[];

    if (!Array.isArray(items) || items.length === 0) {
      items = await rapid('/exercises?limit=1500&offset=0', apiKey) as ExerciseDbItem[];
    }

    const best = items
      .filter(item => item.gifUrl)
      .map(item => ({ item, score: scoreMatch(q, item) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.item;

    return NextResponse.json({ gifUrl: best?.gifUrl ?? null, match: best ?? null, searched: items.length });
  } catch {
    return NextResponse.json({ gifUrl: null, error: 'ExerciseDB fetch failed' });
  }
}
