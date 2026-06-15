type ExerciseDbItem = {
  exerciseId?: string;
  id?: string;
  name?: string;
  gifUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
};

type LookupResult = {
  gifUrl: string;
  match: string | null;
  query: string;
  id: string | null;
};

function pickMedia(item: ExerciseDbItem | null | undefined) {
  return item?.gifUrl || item?.videoUrl || item?.imageUrl || null;
}

function clean(value: string) {
  return value
    .toLowerCase()
    .replace(/[()&:/-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string) {
  return clean(value)
    .split(/\s+/)
    .filter(w => w.length > 2 && ![
      'the','and','with','from','into','hold','focus','gentle','super','band',
      'reps','sets','wall','straight','bent','right','left','optional','around'
    ].includes(w));
}

function score(query: string, item: ExerciseDbItem) {
  const qWords = words(query);
  const name = clean(String(item.name ?? ''));
  let points = 0;

  for (const w of qWords) if (name.includes(w)) points += 10;
  if (name === clean(query)) points += 100;
  if (name.includes(clean(query))) points += 50;

  if (name.includes('lat') && !clean(query).includes('lat')) points -= 35;
  if (name.includes('hip') && clean(query).includes('hip')) points += 20;
  if (name.includes('flexor') && clean(query).includes('flexor')) points += 20;
  if (name.includes('calf') && clean(query).includes('calf')) points += 20;
  if (name.includes('stretch') && clean(query).includes('stretch')) points += 15;
  if (name.includes('ankle') && clean(query).includes('ankle')) points += 15;

  return points;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export function makeGifQueries(input: { name?: string; cue?: string; imageSearch?: string }) {
  const raw = [input.name, input.imageSearch, input.cue, `${input.name ?? ''} ${input.cue ?? ''}`]
    .filter(Boolean)
    .map(v => String(v).trim())
    .filter(v => v.length > 1);

  const text = clean(raw.join(' '));
  const fallback: string[] = [];

  if (text.includes('calf') && text.includes('stretch')) {
    fallback.push('standing calves calf stretch', 'standing calf stretch', 'calf stretch');
  }

  if (text.includes('hip') && text.includes('flexor')) {
    fallback.push('kneeling hip flexor stretch', 'exercise ball hip flexor stretch', 'hip flexor stretch');
  }

  if (text.includes('quad') && text.includes('stretch')) {
    fallback.push('standing quadriceps stretch', 'quad stretch');
  }

  if (text.includes('hamstring')) {
    fallback.push('hamstring stretch', 'standing hamstring stretch');
  }

  if (text.includes('eversion')) {
    fallback.push('ankle eversion', 'band ankle eversion');
  }

  if (text.includes('inversion')) {
    fallback.push('ankle inversion', 'band ankle inversion');
  }

  if (text.includes('balance')) {
    fallback.push('single leg balance', 'single leg stand');
  }

  if (text.includes('toe yoga') || (text.includes('toe') && text.includes('separation'))) {
    fallback.push('toe yoga', 'toe raises');
  }

  if (text.includes('single') && (text.includes('rdl') || text.includes('romanian'))) {
    fallback.push('single leg deadlift', 'single leg romanian deadlift');
  }

  if (text.includes('glute') && text.includes('bridge')) {
    fallback.push('single leg glute bridge', 'glute bridge');
  }

  const simplified = words(raw.join(' ')).slice(0, 6).join(' ');
  if (simplified) fallback.push(simplified);

  return Array.from(new Set([...fallback, ...raw].map(v => v.trim()).filter(Boolean)));
}

export async function findExerciseDbGif(input: { name?: string; cue?: string; imageSearch?: string }) {
  const queries = makeGifQueries(input);

  for (const query of queries) {
    const searchUrl = new URL('https://oss.exercisedb.dev/api/v1/exercises/search');
    searchUrl.searchParams.set('search', query);
    searchUrl.searchParams.set('threshold', '0.15');

    const searchData = await fetchJson(searchUrl.toString());
    const results: ExerciseDbItem[] = Array.isArray(searchData) ? searchData : [];

    const ranked = results
      .map(item => ({ item, points: score(query, item) }))
      .sort((a, b) => b.points - a.points)
      .map(x => x.item);

    for (const result of ranked.slice(0, 10)) {
      const immediate = pickMedia(result);
      if (immediate) {
        return {
          gifUrl: immediate,
          match: result.name ?? null,
          query,
          id: result.exerciseId ?? result.id ?? null,
        } satisfies LookupResult;
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
        } satisfies LookupResult;
      }
    }
  }

  return null;
}
