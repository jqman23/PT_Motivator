import { NextRequest, NextResponse } from 'next/server';

const CANDIDATES = [
  'https://exercisedb-api.vercel.app/api/v1/exercises?search=QUERY',
  'https://exercisedb-api.vercel.app/api/v1/exercises/name/QUERY',
  'https://exercisedb-api.vercel.app/api/exercises?search=QUERY',
  'https://exercisedb-api.vercel.app/api/exercises/name/QUERY',
  'https://exercisedb.vercel.app/api/v1/exercises?search=QUERY',
  'https://exercisedb.vercel.app/api/exercises?search=QUERY',
  'https://exercisedb.p.rapidapi.com/exercises/name/QUERY?limit=5&offset=0',
];

function findGif(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findGif(item);
      if (found) return found;
    }
    return null;
  }

  const record = obj as Record<string, unknown>;

  for (const key of ['gifUrl', 'gifURL', 'gif', 'animationUrl', 'animationURL', 'demoGif', 'mediaUrl']) {
    const value = record[key];
    if (typeof value === 'string' && value.toLowerCase().includes('.gif')) return value;
  }

  for (const value of Object.values(record)) {
    const found = findGif(value);
    if (found) return found;
  }

  return null;
}

function sample(obj: unknown) {
  if (Array.isArray(obj)) return obj.slice(0, 2);
  if (obj && typeof obj === 'object') {
    const r = obj as Record<string, unknown>;
    for (const key of ['data', 'results', 'exercises']) {
      if (Array.isArray(r[key])) return { ...r, [key]: (r[key] as unknown[]).slice(0, 2) };
    }
  }
  return obj;
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || 'squat';
  const apiKey = process.env.EXERCISEDB_RAPIDAPI_KEY;

  const results = [];

  for (const template of CANDIDATES) {
    const url = template.replace('QUERY', encodeURIComponent(q));
    const isRapid = url.includes('rapidapi.com');

    try {
      const res = await fetch(url, {
        headers: isRapid && apiKey ? {
          'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
        } : {},
        cache: 'no-store',
      });

      const text = await res.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch {}

      const gif = findGif(data);

      results.push({
        url,
        ok: res.ok,
        status: res.status,
        contentType: res.headers.get('content-type'),
        gif,
        sample: sample(data),
      });
    } catch (err) {
      results.push({
        url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ query: q, results });
}
