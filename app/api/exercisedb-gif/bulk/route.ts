import { NextRequest, NextResponse } from 'next/server';

type InputExercise = {
  id: string;
  name?: string;
  cue?: string;
  imageSearch?: string;
};

type ExerciseDbItem = {
  exerciseId?: string;
  id?: string;
  name?: string;
  gifUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
};

function pickMedia(item: ExerciseDbItem | null | undefined) {
  return item?.gifUrl || item?.videoUrl || item?.imageUrl || null;
}

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the','and','with','from','into','hold','focus','gentle','super','band','reps','sets'].includes(w));
}

function score(query: string, item: ExerciseDbItem) {
  const qWords = words(query);
  const name = String(item.name ?? '').toLowerCase();
  let points = 0;

  for (const w of qWords) if (name.includes(w)) points += 10;
  if (name === query.toLowerCase()) points += 100;
  if (name.includes(query.toLowerCase())) points += 50;

  if (name.includes('lat') && !query.toLowerCase().includes('lat')) points -= 25;
  if (name.includes('hip') && query.toLowerCase().includes('hip')) points += 20;
  if (name.includes('flexor') && query.toLowerCase().includes('flexor')) points += 20;
  if (name.includes('stretch') && query.toLowerCase().includes('stretch')) points += 15;

  return points;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

function makeQueries(ex: InputExercise) {
  const base = [
    ex.name,
    [ex.name, ex.cue].filter(Boolean).join(' '),
    ex.imageSearch,
    ex.cue,
  ].filter(Boolean);

  return Array.from(new Set(base.map(v => String(v).trim()).filter(v => v.length > 1)));
}

async function findGif(query: string) {
  const searchUrl = new URL('https://oss.exercisedb.dev/api/v1/exercises/search');
  searchUrl.searchParams.set('search', query);
  searchUrl.searchParams.set('threshold', '0.35');

  const searchData = await fetchJson(searchUrl.toString());
  const results: ExerciseDbItem[] = Array.isArray(searchData) ? searchData : [];

  const ranked = results
    .map(item => ({ item, points: score(query, item) }))
    .filter(x => x.points > 0)
    .sort((a, b) => b.points - a.points)
    .map(x => x.item);

  for (const result of ranked.slice(0, 8)) {
    const immediate = pickMedia(result);
    if (immediate) {
      return {
        gifUrl: immediate,
        match: result.name ?? null,
        query,
        id: result.exerciseId ?? result.id ?? null,
      };
    }

    const id = result.exerciseId ?? result.id;
    if (!id) continue;

    const full = await fetchJson(`https://oss.exercisedb.dev/api/v1/exercises/${encodeURIComponent(id)}`) as ExerciseDbItem | null;
    const media = pickMedia(full);

    if (media) {
      return {
        gifUrl: media,
        match: full?.name ?? result.name ?? null,
        query,
        id,
      };
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const exercises: InputExercise[] = Array.isArray(body?.exercises) ? body.exercises : [];

  const updates: Record<string, string> = {};
  const debug: { id: string; name?: string; status: string; query?: string; match?: string | null; gifUrl?: string }[] = [];

  for (const ex of exercises) {
    let found: Awaited<ReturnType<typeof findGif>> = null;

    for (const query of makeQueries(ex)) {
      found = await findGif(query);
      if (found?.gifUrl) break;
    }

    if (found?.gifUrl) {
      updates[ex.id] = found.gifUrl;
      debug.push({ id: ex.id, name: ex.name, status: 'filled', query: found.query, match: found.match, gifUrl: found.gifUrl });
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
