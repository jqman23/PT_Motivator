import { NextRequest, NextResponse } from 'next/server';

type ExerciseDbItem = {
  id?: string;
  name?: string;
  gifUrl?: string;
  target?: string;
  bodyPart?: string;
  equipment?: string;
};

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

async function callExerciseDb(q: string, apiKey?: string) {
  if (!apiKey) return null;

  const res = await fetch(
    `https://exercisedb.p.rapidapi.com/exercises/name/${encodeURIComponent(q)}?limit=10&offset=0`,
    {
      headers: {
        'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
      },
      cache: 'no-store',
    }
  );

  if (!res.ok) return null;
  const items = (await res.json()) as ExerciseDbItem[];
  const best = items
    .filter(item => item.gifUrl)
    .map(item => ({ item, score: scoreMatch(q, item) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.item;

  return best?.gifUrl ? { gifUrl: best.gifUrl, source: 'exercisedb', match: best } : null;
}


export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ gifUrl: null, error: 'missing query' });

  const exerciseDb = await callExerciseDb(q, process.env.EXERCISEDB_RAPIDAPI_KEY);
  if (exerciseDb) return NextResponse.json(exerciseDb);

  return NextResponse.json({
    gifUrl: null,
    error: 'No real ExerciseDB gifUrl available from current API response.',
  });
}
