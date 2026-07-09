import { NextRequest, NextResponse } from 'next/server';
import { Exercise } from '@/lib/exercises';
import { callGroqChat, getGroqModelChain, groqErrorPayload } from '@/lib/groq';

function cleanText(value: unknown, limit = 1400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanList(value: unknown, limit = 16, itemLimit = 500) {
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
  const name = cleanText(raw.name, 140);
  const cue = cleanText(raw.cue, 260);
  const sets = cleanText(raw.sets, 260);
  const imageSearch = cleanText(raw.imageSearch, 220);
  const sourceId = cleanText(raw.sourceId, 90);
  const gifUrl = cleanText(raw.gifUrl, 400);
  const cat = cleanText(raw.type ?? raw.cat, 40).toLowerCase().replace(/[^a-z0-9 /&-]+/g, '').trim();
  const origin = cleanText(raw.origin, 40);

  if (name) patch.name = name;
  if (cue) patch.cue = cue;
  if (sets) patch.sets = sets;
  if (cat) patch.cat = cat;
  if (typeof raw.optional === 'boolean') patch.optional = raw.optional;
  if (imageSearch) patch.imageSearch = imageSearch;
  if (sourceId) patch.sourceId = sourceId;
  if (gifUrl) patch.gifUrl = gifUrl;
  if (['hep', 'patient_added', 'exercisedb', 'api_ninjas'].includes(origin)) patch.origin = origin as NonNullable<Exercise['origin']>;

  const videoIds = cleanList(raw.videoIds, 8, 80);
  const videoTitles = cleanList(raw.videoTitles, 8, 160);
  const tips = cleanList(raw.tips, 10, 360);
  const summary = cleanList(raw.summary, 6, 180);

  if (videoIds.length) patch.videoIds = videoIds;
  if (videoTitles.length) patch.videoTitles = videoTitles;
  if (tips.length) patch.tips = tips;
  if (summary.length) patch.summary = summary;

  return patch;
}

export async function POST(req: NextRequest) {
  let task: 'edit' | 'enhance' = 'edit';
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) return NextResponse.json({ error: 'Missing GROQ_KEY_PTMOTIVATOR' }, { status: 500 });

    const { instruction, exercise, mode } = await req.json();
    const cleanInstruction = cleanText(instruction, 1600);
    const isEnhance = mode === 'enhance';
    task = isEnhance ? 'enhance' : 'edit';

    if (!cleanInstruction && !isEnhance) return NextResponse.json({ error: 'Instruction required' }, { status: 400 });

    const current = {
      id: cleanText(exercise?.id, 80),
      name: cleanText(exercise?.name, 140),
      cue: cleanText(exercise?.cue, 1000),
      sets: cleanText(exercise?.sets, 260),
      cat: cleanText(exercise?.cat, 20),
      optional: !!exercise?.optional,
      origin: cleanText(exercise?.origin, 40),
      sourceId: cleanText(exercise?.sourceId, 90),
      gifUrl: cleanText(exercise?.gifUrl, 300),
      imageSearch: cleanText(exercise?.imageSearch, 220),
      videoIds: cleanList(exercise?.videoIds, 8, 80),
      videoTitles: cleanList(exercise?.videoTitles, 8, 160),
      tips: cleanList(exercise?.tips, 18, 520),
    };

    const system = [
      'Return JSON only.',
      'Build one app exercise record for review before saving.',
      'First identify whether the source matches a known exercise or common variation.',
      'Use the standard name and terminology when confident.',
      'Correct obvious source mistakes only when confidence is high.',
      'If the source describes an intentional variation, keep the useful variation details.',
      'Fill every field you can confidently fill: name, cue, sets, type, imageSearch, tips.',
      'Cue is the SHORT cue field: one compact sentence, max 180 characters, not full instructions.',
      'Put detailed setup, sequence steps, control notes, and optional refinements in tips instead of cue.',
      'Tips should be short, useful bullets with one idea per item.',
      'Do not add unsupported benefits, claims, mechanics, or random tips.',
      'If confidence is low for a field, leave that field blank.',
      'JSON shape: {"summary":[],"name":"","cue":"","sets":"","type":"mobility","optional":false,"origin":"patient_added","sourceId":"","gifUrl":"","imageSearch":"","videoIds":[],"videoTitles":[],"tips":[]}.'
    ].join(' ');

    const finalInstruction = isEnhance
      ? 'Identify the best known exercise or variation, correct obvious mistakes only if confident, and fill the app fields. Keep cue very short; put full steps in tips. Do not invent unsupported details.'
      : cleanInstruction;

    const { data, model, attemptedModels } = await callGroqChat(apiKey, task, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ instruction: finalInstruction, mode: isEnhance ? 'enhance' : 'custom', exercise: current }) },
      ],
      temperature: isEnhance ? 0.12 : 0.1,
      max_completion_tokens: isEnhance ? 1500 : 1000,
      response_format: { type: 'json_object' },
    });

    const content = data?.choices?.[0]?.message?.content ?? '{}';
    const parsed = jsonFromText(content);
    const proposal = normalizeExercisePatch(parsed);

    return NextResponse.json({ proposal, model, attemptedModels });
  } catch (err) {
    console.error('[ai-exercise-edit]', err);
    const payload = groqErrorPayload(err);
    return NextResponse.json({ ...payload, model: payload.model ?? getGroqModelChain(task)[0] }, { status: payload.error === 'Groq request failed' ? 502 : 500 });
  }
}
