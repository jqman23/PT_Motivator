import { NextRequest, NextResponse } from 'next/server';
import { callGroqChat, getGroqModelChain, groqErrorPayload } from '@/lib/groq';

const DEFAULT_MODEL = getGroqModelChain('ask')[0];

function cleanText(value: unknown, limit = 1200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function jsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object returned');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) return NextResponse.json({ error: 'Missing GROQ_KEY_PTMOTIVATOR' }, { status: 500 });

    const { question, history, exercises, clarificationCount, sourceMatches } = await req.json();
    const cleanQuestion = cleanText(question, 1200);
    if (!cleanQuestion) return NextResponse.json({ error: 'Question required' }, { status: 400 });

    const system = [
      'Help the user identify a remembered movement and turn it into an editable app draft.',
      'Use the app list and database matches as context, not as strict limits.',
      'Respect the user-described setup and movement details. Do not overwrite them with generic form advice.',
      'When unclear, ask one short clarifying question and return 2-3 short option labels.',
      'Return compact JSON only: {"answer":"","options":[],"confirmedExercise":{"name":"","cue":"","sets":"","type":"mobility","imageSearch":"","confidence":"","nextStep":"","tips":[]}}. Omit confirmedExercise if not confident.'
    ].join(' ');

    const { data, model, attemptedModels } = await callGroqChat(apiKey, 'ask', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ question: cleanQuestion, history, exercises, clarificationCount, sourceMatches }) },
      ],
      temperature: 0.26,
      max_completion_tokens: 920,
      response_format: { type: 'json_object' },
    });

    const raw = jsonFromText(data?.choices?.[0]?.message?.content ?? '{}');
    const confirmed = raw.confirmedExercise && typeof raw.confirmedExercise === 'object' ? raw.confirmedExercise : undefined;

    return NextResponse.json({
      reply: {
        answer: cleanText(raw.answer, 520) || 'I can help narrow it down. Which version sounds closest?',
        options: Array.isArray(raw.options) ? raw.options.map((option: unknown) => cleanText(option, 110)).filter(Boolean).slice(0, 3) : [],
        confirmedExercise: confirmed ? {
          name: cleanText(confirmed.name, 120),
          cue: cleanText(confirmed.cue, 520),
          sets: cleanText(confirmed.sets, 180),
          cat: cleanText(confirmed.type ?? confirmed.cat, 40).toLowerCase().replace(/[^a-z0-9 /&-]+/g, '').trim() || 'mobility',
          imageSearch: cleanText(confirmed.imageSearch, 180),
          confidence: cleanText(confirmed.confidence, 80),
          nextStep: cleanText(confirmed.nextStep, 220),
          tips: Array.isArray(confirmed.tips) ? confirmed.tips.map((tip: unknown) => cleanText(tip, 140)).filter(Boolean).slice(0, 3) : [],
        } : undefined,
      },
      model,
      attemptedModels,
    });
  } catch (err) {
    console.error('[ai-exercise-question]', err);
    const payload = groqErrorPayload(err);
    return NextResponse.json({ ...payload, model: payload.model ?? DEFAULT_MODEL }, { status: payload.error === 'Groq request failed' ? 502 : 500 });
  }
}
