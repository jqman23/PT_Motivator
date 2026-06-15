import { NextRequest, NextResponse } from 'next/server';
import { findCuratedGif } from '@/lib/gifMap';

type GiphyHit = {
  title?: string;
  slug?: string;
  username?: string;
  url?: string;
  images?: {
    downsized_medium?: { url?: string };
    original?: { url?: string };
    fixed_height?: { url?: string };
  };
};

const JUNK_WORDS = [
  'super', 'band', 'right', 'left', 'hold', 'reps', 'rep', 'sets', 'set',
  'gentle', 'focus', 'slow', 'controlled', 'optional', 'warmup', 'warm',
  'demo', 'pt', 'rehab', 'exercise', 'workout'
];

const GOOD_WORDS = [
  'stretch', 'lunge', 'squat', 'plank', 'bridge', 'balance', 'calf',
  'hip', 'quad', 'hamstring', 'glute', 'ankle', 'knee', 'mobility',
  'strength', 'yoga', 'pilates', 'physical therapy', 'fitness', 'form'
];

const BAD_WORDS = [
  'funny', 'meme', 'reaction', 'dance', 'cartoon', 'anime', 'girl', 'girls',
  'black girls', 'honestyb', 'celebrity', 'cat', 'dog'
];

function cleanQuery(raw: string) {
  let q = raw.toLowerCase();
  q = q.replace(/[()]/g, ' ');
  q = q.replace(/[^a-z0-9 ]/g, ' ');
  let words = q.split(/\s+/).filter(Boolean);
  words = words.filter(w => !JUNK_WORDS.includes(w));

  // Keep query short for GIPHY's 50-char q limit
  const core = words.slice(0, 5).join(' ').trim();

  return core || raw.slice(0, 40);
}

function scoreHit(hit: GiphyHit, core: string) {
  const text = `${hit.title ?? ''} ${hit.slug ?? ''} ${hit.username ?? ''}`.toLowerCase();
  let score = 0;

  for (const w of core.split(/\s+/)) {
    if (w.length > 2 && text.includes(w)) score += 8;
  }

  for (const w of GOOD_WORDS) {
    if (text.includes(w)) score += 4;
  }

  for (const w of BAD_WORDS) {
    if (text.includes(w)) score -= 20;
  }

  // Prefer boring instructional / fitness-ish creators if present
  if (text.includes('fitness')) score += 8;
  if (text.includes('trainer')) score += 8;
  if (text.includes('yoga')) score += 8;
  if (text.includes('stretch')) score += 8;

  return score;
}

async function callGiphy(raw: string) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) return null;

  const core = cleanQuery(raw);

  const queries = [
    core,
    `${core} stretch`,
    `${core} exercise`,
    `${core} fitness`,
  ].map(q => q.slice(0, 50));

  let best: { hit: GiphyHit; score: number; query: string } | null = null;

  for (const q of queries) {
    const params = new URLSearchParams({
      api_key: apiKey,
      q,
      limit: '25',
      rating: 'g',
      lang: 'en',
      bundle: 'messaging_non_clips',
    });

    const res = await fetch(`https://api.giphy.com/v1/gifs/search?${params}`, { cache: 'no-store' });
    if (!res.ok) continue;

    const data = await res.json();
    const hits = (data?.data ?? []) as GiphyHit[];

    for (const hit of hits) {
      const score = scoreHit(hit, core);
      if (!best || score > best.score) best = { hit, score, query: q };
    }
  }

  if (!best || best.score < 1) return null;

  const gifUrl =
    best.hit.images?.downsized_medium?.url ??
    best.hit.images?.fixed_height?.url ??
    best.hit.images?.original?.url;

  if (!gifUrl) return null;

  return {
    gifUrl,
    source: 'giphy',
    match: best.hit.title ?? best.hit.slug ?? null,
    query: best.query,
    score: best.score,
  };
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ gifUrl: null, error: 'missing query' });

  const curated = findCuratedGif(q);
  if (curated) return NextResponse.json(curated);

  const giphy = await callGiphy(q);
  if (giphy) return NextResponse.json(giphy);

  return NextResponse.json({
    gifUrl: null,
    source: null,
    error: 'No curated or GIPHY GIF found.',
  });
}
