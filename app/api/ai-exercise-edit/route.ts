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
  const cue = cleanText(raw.cue, 700);
  const sets = cleanText(raw.sets, 260);
  const imageSearch = cleanText(raw.imageSearch, 220);
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

  const videoIds = cleanList(raw.videoIds, 8, 80);
  const videoTitles = cleanList(raw.videoTitles, 8, 160);
  const tips = cleanList(raw.tips, 18, 520);
  const summary = cleanList(raw.summary, 8, 220);

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
      cue: cleanText(exercise?.cue, 700),
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
      'You propose edits to one physical therapy / exercise record. Return JSON only.',
      'Do not save anything. Only propose field values for the user to review before applying.',
      'For normal custom edits, follow the user instruction closely.',
      'For enhance mode, use the current exercise as a seed and integrate broad professional exercise, coaching, and physical-therapy-informed knowledge to make the exercise much more usable.',
      'For enhance mode, do not be limited to the existing wording. You may substantially rewrite the cue, dosage, name, search terms, and tips if that makes the exercise easier to understand and perform.',
      'Enhance mode should think like a careful PT/exercise coach writing phone-friendly instructions: setup, equipment, starting posture, exact movement, tempo, breathing, range, target sensation, common mistakes, regressions/progressions, stop/scale-down cues, and best-practice reminders.',
      'Do not diagnose, claim to treat/cure, prescribe aggressive progression, or override a clinician. Keep safety cues practical and conservative.',
      'Use clear plain language. It is okay for enhance mode to be detailed; the user can edit the proposal before saving.',
      'Valid cat values: mobility, strength. Valid origin values: hep, patient_added, exercisedb, api_ninjas.',
      'JSON shape: {"summary":[],"name":"","cue":"","sets":"","cat":"mobility","optional":false,"origin":"patient_added","sourceId":"","gifUrl":"","imageSearch":"","videoIds":[],"videoTitles":[],"tips":[]}.',
      'Tips should be one instruction or best-practice reminder per item. YouTube videoIds should be IDs only, not full URLs.',
    ].join(' ');

    const enhanceInstruction = [
      'Enhance this exercise record deeply.',
      'Use broad professional knowledge about physical therapy, exercise coaching, biomechanics, motor control, safety, and practical home-exercise instruction.',
      'Expand beyond what is already there when useful. Make the record feel like a strong, clear exercise card someone could follow without needing extra explanation.',
      'Prefer rich, useful detail over minimalism. Add precise setup, body position, movement steps, tempo, breathing, dosage, target sensation, common mistakes, modifications, progression/regression ideas, and stop/scale-down cues.',
      'Keep wording user-facing and app-friendly, not academic. Keep recommendations conservative and editable.',
      'Return a complete proposed improved exercise record when beneficial, especially cue, sets, imageSearch, and many high-quality tips.',
      'Do not add a diagnosis or medical certainty. Do not make it sound like emergency or clinician-only advice. The user reviews before saving.',
    ].join(' ');

    const { data, model, attemptedModels } = await callGroqChat(apiKey, task, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ instruction: isEnhance ? enhanceInstruction : cleanInstruction, mode: isEnhance ? 'enhance' : 'custom', exercise: current }) },
      ],
      temperature: isEnhance ? 0.34 : 0.1,
      max_completion_tokens: isEnhance ? 2600 : 1000,
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
