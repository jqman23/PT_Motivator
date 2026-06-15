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

async function callExerciseDb(path: string, apiKey: string) {
  const url = `https://exercisedb.p.rapidapi.com${path}`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    cache: 'no-store',
  });

  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = text; }

  return { ok: res.ok, status: res.status, url, data };
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ gifUrl: null, debug: 'missing q' });

  const apiKey = process.env.EXERCISEDB_RAPIDAPI_KEY;
  if (!apiKey) return NextResponse.json({ gifUrl: null, noKey: true });

  const attempts = [
    `/exercises/name/${encodeURIComponent(q)}?limit=20&offset=0`,
    `/exercises?limit=1500&offset=0`,
  ];

  const debug: unknown[] = [];

  for (const path of attempts) {
    const result = await callExerciseDb(path, apiKey);
    debug.push({
      path,
      ok: result.ok,
      status: result.status,
      sample: Array.isArray(result.data) ? result.data.slice(0, 3) : result.data,
    });

    if (!result.ok || !Array.isArray(result.data)) continue;

    const best = (result.data as ExerciseDbItem[])
      .filter(item => item.gifUrl)
      .map(item => ({ item, score: scoreMatch(q, item) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.item;

    if (best?.gifUrl) {
      return NextResponse.json({ gifUrl: best.gifUrl, match: best, debug });
    }
  }

  return NextResponse.json({ gifUrl: null, match: null, debug });
}
