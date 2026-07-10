import { NextRequest, NextResponse } from 'next/server';
import { callGroqChat, groqErrorPayload } from '@/lib/groq';

function cleanText(value: unknown, limit = 4000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanList(value: unknown, limit = 5, itemLimit = 180) {
  return Array.isArray(value)
    ? value.map(item => cleanText(item, itemLimit)).filter(Boolean).slice(0, limit)
    : [];
}

function parseJson(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object returned');
  return JSON.parse(match[0]);
}

function localFallback(input: { title: string; body: string }) {
  const title = input.title || 'Doctor note';
  const body = cleanText(input.body, 1800);
  return {
    improvedTitle: title,
    improvedBody: body,
    highlights: ['AI cleanup unavailable. Original note preserved.'],
    questions: [],
  };
}

export async function POST(req: NextRequest) {
  let fallbackTitle = 'Doctor note';
  let fallbackBody = '';

  try {
    const body = await req.json();
    const title = cleanText(body.title, 180);
    const doctor = cleanText(body.doctor, 180);
    const kind = cleanText(body.kind, 60);
    const noteBody = cleanText(body.body, 3000);
    const relatedDates = cleanList(body.relatedDates, 8, 40);
    fallbackTitle = title;
    fallbackBody = noteBody;

    if (!title && !noteBody) {
      return NextResponse.json({ error: 'title or note required' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) return NextResponse.json(localFallback({ title, body: noteBody }));

    const system = [
      'You rewrite patient notes for a doctor visit. Return compact JSON only.',
      'Make the note clearer, clinically useful, and easy for a doctor to scan.',
      'Do not diagnose. Do not add medical facts. Do not invent symptoms, dates, tests, severity, medications, or advice.',
      'Preserve uncertainty using patient language like "seems", "maybe", or "not sure" when the original is uncertain.',
      'A strong doctor note includes the reason/question, timeline or onset, location/side, symptom quality, severity if provided, triggers, relievers, functional impact, treatments/tests already tried, and the decision or answer needed.',
      'If details are missing, do not fabricate them. Put at most three useful follow-up prompts in questions.',
      'Tone: concise, specific, medically literate, but still clearly a patient note.',
      'Use short paragraphs or compact bullets only when helpful.',
      'JSON shape: {"improvedTitle":"","improvedBody":"","highlights":[],"questions":[]}.',
    ].join(' ');

    const user = JSON.stringify({
      title,
      doctor,
      kind,
      body: noteBody,
      relatedDates,
    });

    const { data, model, attemptedModels } = await callGroqChat(apiKey, 'enhance', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.18,
      max_completion_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const parsed = parseJson(data?.choices?.[0]?.message?.content ?? '{}');
    return NextResponse.json({
      improvedTitle: cleanText(parsed.improvedTitle || title, 180),
      improvedBody: cleanText(parsed.improvedBody || noteBody, 3000),
      highlights: cleanList(parsed.highlights, 5, 160),
      questions: cleanList(parsed.questions, 3, 180),
      model,
      attemptedModels,
    });
  } catch (error) {
    const payload = groqErrorPayload(error);
    return NextResponse.json({ ...payload, ...localFallback({ title: fallbackTitle, body: fallbackBody }) }, { status: payload.error === 'Groq request failed' ? 502 : 500 });
  }
}
