import { NextRequest, NextResponse } from 'next/server';
import { callGroqChat, getGroqApiKeys, groqErrorPayload } from '@/lib/groq';
import { stripSecretNotes } from '@/lib/secretNotes';

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
    const noteBody = cleanText(stripSecretNotes(body.body), 3000);
    const relatedDates = cleanList(body.relatedDates, 8, 40);
    fallbackTitle = title;
    fallbackBody = noteBody;

    if (!title && !noteBody) {
      return NextResponse.json({ error: 'title or note required' }, { status: 400 });
    }

    const apiKeys = getGroqApiKeys();
    if (!apiKeys.length) return NextResponse.json(localFallback({ title, body: noteBody }));

    const system = [
      'You rewrite my notes for a doctor visit. Return compact JSON only.',
      'Make the note clearer, clinically useful, and easy for me to read or reference while talking to my doctor.',
      'Write in first person from my perspective. Use "I", "my", and "me" when needed.',
      'Do not write about me as "the patient". Do not say "patient asks", "patient reports", or similar third-person clinical phrasing.',
      'Do not diagnose. Do not add medical facts. Do not invent symptoms, dates, tests, severity, medications, or advice.',
      'Preserve uncertainty using patient language like "seems", "maybe", or "not sure" when the original is uncertain.',
      'Default to a short, direct action phrase or one compact sentence. Do not expand a short question into a full narrative.',
      'Only include timeline, location, severity, triggers, relievers, functional impact, treatments, or tests if the original explicitly includes them.',
      'If the note is mainly a question, rewrite it as a concise ask. Example: "hindfoot valgus deformity how to test for it" should become "Ask about physical exam maneuvers, imaging studies, or other tests for hindfoot valgus."',
      'For improvedTitle, use a short direct topic label. Avoid filler prefixes like "Question about", "Concern about", "Discussion of", or "Follow-up on". Example title: "Testing for hindfoot valgus deformity".',
      'Avoid extra status bullets like "current status", "goal", or "concern" unless the original note clearly asks for that structure.',
      'If details are missing, do not fabricate them. Put at most two useful follow-up prompts in questions.',
      'Tone: concise, specific, medically literate, but still clearly my note.',
      'Use compact bullets only when the original has multiple distinct points.',
      'JSON shape: {"improvedTitle":"","improvedBody":"","highlights":[],"questions":[]}.',
    ].join(' ');

    const user = JSON.stringify({
      title,
      doctor,
      kind,
      body: noteBody,
      relatedDates,
    });

    const { data, model, attemptedModels } = await callGroqChat(apiKeys, 'enhance', {
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
