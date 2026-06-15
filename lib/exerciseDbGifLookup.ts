type ExerciseDbItem = {
  exerciseId?: string;
  id?: string;
  name?: string;
  gifUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  targetMuscles?: string[];
  secondaryMuscles?: string[];
  bodyParts?: string[];
  equipments?: string[];
  instructions?: string[];
};

type LookupResult = {
  gifUrl: string;
  match: string | null;
  query: string;
  id: string | null;
  score: number;
};

function pickMedia(item: ExerciseDbItem | null | undefined) {
  return item?.gifUrl || item?.videoUrl || item?.imageUrl || null;
}

function clean(value: string) {
  return value
    .toLowerCase()
    .replace(/[()&:/_-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string) {
  return clean(value)
    .split(/\s+/)
    .filter(w => w.length > 2 && ![
      'the','and','with','from','into','hold','focus','gentle','super','band',
      'reps','sets','wall','straight','bent','right','left','optional','around',
      'slow','controlled','seconds','minute','minutes','each','side'
    ].includes(w));
}

function itemText(item: ExerciseDbItem) {
  return clean([
    item.name,
    ...(item.targetMuscles ?? []),
    ...(item.secondaryMuscles ?? []),
    ...(item.bodyParts ?? []),
    ...(item.equipments ?? []),
    ...(item.instructions ?? []),
  ].filter(Boolean).join(' '));
}

function scoreCandidate(original: string, item: ExerciseDbItem) {
  const inputWords = words(original);
  const name = clean(String(item.name ?? ''));
  const text = itemText(item);

  let points = 0;

  for (const w of inputWords) {
    if (name.includes(w)) points += 18;
    else if (text.includes(w)) points += 7;
  }

  const originalClean = clean(original);
  if (name === originalClean) points += 200;
  if (name.includes(originalClean)) points += 100;

  const inputSet = new Set(inputWords);
  const nameSet = new Set(words(name));
  const intersection = [...inputSet].filter(w => nameSet.has(w)).length;
  const union = new Set([...inputSet, ...nameSet]).size || 1;
  points += Math.round((intersection / union) * 60);

  // Important PT-specific nudges
  if (originalClean.includes('calf') && name.includes('calf')) points += 40;
  if (originalClean.includes('calves') && name.includes('calves')) points += 40;
  if (originalClean.includes('hip') && name.includes('hip')) points += 35;
  if (originalClean.includes('flexor') && name.includes('flexor')) points += 35;
  if (originalClean.includes('hamstring') && name.includes('hamstring')) points += 35;
  if (originalClean.includes('quad') && (name.includes('quad') || name.includes('quadriceps'))) points += 35;
  if (originalClean.includes('glute') && name.includes('glute')) points += 35;
  if (originalClean.includes('ankle') && name.includes('ankle')) points += 30;
  if (originalClean.includes('balance') && (name.includes('balance') || name.includes('single leg'))) points += 25;
  if (originalClean.includes('stretch') && name.includes('stretch')) points += 30;

  // Avoid common wrong but high-frequency matches
  if (name.includes('lat') && !originalClean.includes('lat')) points -= 60;
  if (name.includes('chest') && !originalClean.includes('chest')) points -= 40;
  if (name.includes('biceps') && !originalClean.includes('bicep')) points -= 30;

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
  const q: string[] = [];

  // Strong semantic translations from PT wording → ExerciseDB wording
  if (text.includes('calf') && text.includes('stretch')) q.push('standing calves calf stretch', 'standing calf stretch', 'calf stretch');
  if (text.includes('hip') && text.includes('flexor')) q.push('kneeling hip flexor stretch', 'hip flexor stretch');
  if (text.includes('quad') && text.includes('stretch')) q.push('standing quadriceps stretch', 'quadriceps stretch');
  if (text.includes('hamstring')) q.push('hamstring stretch', 'standing hamstring stretch');
  if (text.includes('eversion')) q.push('ankle eversion');
  if (text.includes('inversion')) q.push('ankle inversion');
  if (text.includes('balance')) q.push('single leg balance', 'single leg stand');
  if (text.includes('single') && (text.includes('rdl') || text.includes('romanian'))) q.push('single leg deadlift', 'single leg romanian deadlift');
  if (text.includes('glute') && text.includes('bridge')) q.push('glute bridge', 'single leg glute bridge');

  const meaningfulWords = words(raw.join(' '));
  const simplified = meaningfulWords.slice(0, 6).join(' ');
  if (simplified) q.push(simplified);

  for (let size = Math.min(5, meaningfulWords.length); size >= 2; size--) {
    for (let i = 0; i <= meaningfulWords.length - size; i++) {
      q.push(meaningfulWords.slice(i, i + size).join(' '));
    }
  }

  for (const w of meaningfulWords) q.push(w);

  // Broad real-DB category fallbacks. Still searches ExerciseDB, not hardcoded media.
  if (text.includes('stretch')) q.push('stretch');
  if (text.includes('mobility')) q.push('mobility');
  if (text.includes('balance')) q.push('balance');
  if (text.includes('strength')) q.push('strength');
  if (text.includes('ankle')) q.push('ankle');
  if (text.includes('hip')) q.push('hip');
  if (text.includes('calf') || text.includes('calves')) q.push('calf', 'calves');
  if (text.includes('toe')) q.push('toe');
  if (text.includes('glute')) q.push('glute');
  if (text.includes('hamstring')) q.push('hamstring');

  // Absolute last real-database searches.
  q.push('stretch', 'body weight', 'strength');

  return Array.from(new Set([...q, ...raw].map(v => v.trim()).filter(Boolean)));
}

async function searchExerciseDb(query: string) {
  const url = new URL('https://oss.exercisedb.dev/api/v1/exercises/search');
  url.searchParams.set('search', query);
  url.searchParams.set('threshold', '0.0');

  const data = await fetchJson(url.toString());
  return Array.isArray(data) ? data as ExerciseDbItem[] : [];
}

async function hydrateIfNeeded(item: ExerciseDbItem) {
  if (pickMedia(item)) return item;

  const id = item.exerciseId ?? item.id;
  if (!id) return item;

  const full = await fetchJson(`https://oss.exercisedb.dev/api/v1/exercises/${encodeURIComponent(id)}`) as ExerciseDbItem | null;
  return full ?? item;
}

export async function findExerciseDbGif(input: { name?: string; cue?: string; imageSearch?: string }) {
  const original = [input.name, input.imageSearch, input.cue].filter(Boolean).join(' ');
  const queries = makeGifQueries(input);

  const byId = new Map<string, { item: ExerciseDbItem; query: string }>();

  for (const query of queries) {
    const results = await searchExerciseDb(query);

    for (const item of results.slice(0, 25)) {
      const id = item.exerciseId ?? item.id ?? item.name;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, { item, query });
    }

    // Don't overfetch forever once we have a real candidate pool
    if (byId.size >= 100) break;
  }

  // If the API gave nothing somehow, do one final broad real DB search.
  if (byId.size === 0) {
    const broad = await searchExerciseDb('stretch');
    for (const item of broad.slice(0, 25)) {
      const id = item.exerciseId ?? item.id ?? item.name;
      if (id) byId.set(id, { item, query: 'stretch' });
    }
  }

  const candidates = [];

  for (const entry of byId.values()) {
    const full = await hydrateIfNeeded(entry.item);
    const media = pickMedia(full);
    if (!media) continue;

    candidates.push({
      gifUrl: media,
      match: full.name ?? entry.item.name ?? null,
      query: entry.query,
      id: full.exerciseId ?? full.id ?? entry.item.exerciseId ?? entry.item.id ?? null,
      score: scoreCandidate(original, full),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0] ?? null;
}

export async function findExerciseDbGifCandidates(input: { name?: string; cue?: string; imageSearch?: string }, limit = 8) {
  const original = [input.name, input.imageSearch, input.cue].filter(Boolean).join(' ');
  const queries = makeGifQueries(input);
  const byId = new Map<string, { item: ExerciseDbItem; query: string }>();

  for (const query of queries) {
    const results = await searchExerciseDb(query);
    for (const item of results.slice(0, 25)) {
      const id = item.exerciseId ?? item.id ?? item.name;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, { item, query });
    }
    if (byId.size >= 100) break;
  }

  const candidates = [];

  for (const entry of byId.values()) {
    const full = await hydrateIfNeeded(entry.item);
    const media = pickMedia(full);
    if (!media) continue;

    candidates.push({
      gifUrl: media,
      match: full.name ?? entry.item.name ?? null,
      query: entry.query,
      id: full.exerciseId ?? full.id ?? entry.item.exerciseId ?? entry.item.id ?? null,
      score: scoreCandidate(original, full),
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}
