import { NextRequest, NextResponse } from 'next/server';
import { Exercise } from '@/lib/exercises';

const MODEL = process.env.GROQ_MODEL_PTMOTIVATOR || 'llama-3.3-70b-versatile';

function cleanText(value: unknown, limit = 900) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanList(value: unknown, limit = 8, itemLimit = 180) {
  return Array.isArray(value)
    ? value.map(item => cleanText(item, itemLimit)).filter(Boolean).slice(0, limit)
    : [];
}

function jsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object returned');
  return JSON.parse(match[0]);
}

function normalizeExercisePatch(raw: Record<string, unknown>) {
  const patch: Partial<Exercise> & { summary?: string[] } = {};
  const name = cleanText(raw.name, 90);
  const cue = cleanText(raw.cue, 180);
  const sets = cleanText(raw.sets, 100);
  const imageSearch = cleanText(raw.imageSearch, 160);
  const sourceId = cleanText(raw.sourceId, 90);
  const gifUrl = cleanText(raw.gifUrl, 400);
  const cat = cleanText(raw.cat, 20);
  const origin = cleanText(raw.origin, 40);

  if (name) patch.name = name;
  if (cue) patch.cue = cue;
  if (sets) patch.sets = sets;
  if (cat === 'mobility' || cat === 'strength') patch.cat = cat;
  if (typeof raw.optional === 'boolean') patch.optional = raw.optional;
  if (imageSearch) patch.imageSearch = imageSearch;
  if (sourceId) patch.sourceId = sourceId;
  if (gifUrl) patch.gifUrl = gifUrl;
  if (['hep', 'patient_added', 'exercisedb', 'api_ninjas'].includes(origin)) patch.origin = origin as NonNullable<Exercise['origin']>;

  const videoIds = cleanList(raw.videoIds, 6, 60);
  const videoTitles = cleanList(raw.videoTitles, 6, 120);
  const tips = cleanList(raw.tips, 10, 240);
  const summary = cleanList(raw.summary, 6, 160);

  if (videoIds.length) patch.videoIds = videoIds;
  if (videoTitles.length) patch.videoTitles = videoTitles;
  if (tips.length) patch.tips = tips;
  if (summary.length) patch.summary = summary;

  return patch;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) return NextResponse.json({ error: 'Missing GROQ_KEY_PTMOTIVATOR' }, { status: 500 });

    const { instruction, exercise } = await req.json();
    if (!cleanText(instruction, 1000)) return NextResponse.json({ error: 'Instruction required' }, { status: 400 });

    const current = {
      id: cleanText(exercise?.id, 80),
      name: cleanText(exercise?.name, 100),
      cue: cleanText(exercise?.cue, 180),
      sets: cleanText(exercise?.sets, 120),
      cat: cleanText(exercise?.cat, 20),
      optional: !!exercise?.optional,
      origin: cleanText(exercise?.origin, 40),
      sourceId: cleanText(exercise?.sourceId, 90),
      gifUrl: cleanText(exercise?.gifUrl, 300),
      imageSearch: cleanText(exercise?.imageSearch, 160),
      videoIds: cleanList(exercise?.videoIds, 6, 60),
      videoTitles: cleanList(exercise?.videoTitles, 6, 120),
      tips: cleanList(exercise?.tips, 10, 240),
    };

    const system = [
      'You propose edits to one physical therapy exercise record. Return compact JSON only.',
      'Do not save anything. Only propose field values that should change or be improved.',
      'Keep language concise, practical, and patient-friendly. Do not diagnose or add risky medical instructions.',
      'Valid cat values: mobility, strength. Valid origin values: hep, patient_added, exercisedb, api_ninjas.',
      'JSON shape: {"summary":[],"name":"","cue":"","sets":"","cat":"mobility","optional":false,"origin":"patient_added","sourceId":"","gifUrl":"","imageSearch":"","videoIds":[],"videoTitles":[],"tips":[]}.',
      'Omit unchanged or irrelevant fields. Tips should be one instruction per item. YouTube videoIds should be IDs only, not full URLs.',
    ].join(' ');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ instruction: cleanText(instruction, 1200), exercise: current }) },
        ],
        temperature: 0.1,
        max_completion_tokens: 900,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: 'Groq request failed', detail: detail.slice(0, 500) }, { status: 502 });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    const parsed = jsonFromText(content);
    const proposal = normalizeExercisePatch(parsed);

    return NextResponse.json({ proposal, model: MODEL });
  } catch (err) {
    console.error('[ai-exercise-edit]', err);
    return NextResponse.json({ error: 'AI edit failed' }, { status: 500 });
  }
}
