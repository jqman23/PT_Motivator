import { NextRequest, NextResponse } from 'next/server';

const MODEL = process.env.GROQ_MODEL_PTMOTIVATOR || 'llama-3.3-70b-versatile';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function cleanText(value: unknown, limit = 1200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function optionText(value: unknown) {
  return cleanText(value, 96).replace(/[?？]+$/g, '').trim();
}

function cleanOptions(value: unknown) {
  return Array.isArray(value) ? value.map(optionText).filter(Boolean).slice(0, 3) : [];
}

function groqDetailFromText(text: string) {
  const fallback = cleanText(text, 300);
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message || fallback;
    const code = parsed?.error?.code || parsed?.error?.type || parsed?.code;
    return [code, message].filter(Boolean).join(': ') || fallback;
  } catch {
    return fallback;
  }
}

function jsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object returned');
  return JSON.parse(match[0]);
}

function normalizeReply(raw: Record<string, unknown>, allowOptions = true) {
  const confirmed = raw.confirmedExercise && typeof raw.confirmedExercise === 'object'
    ? raw.confirmedExercise as Record<string, unknown>
    : null;

  return {
    answer: cleanText(raw.answer, 360) || 'I can help narrow it down. Which version sounds closest?',
    options: allowOptions ? cleanOptions(raw.options) : [],
    confirmedExercise: confirmed ? {
      name: cleanText(confirmed.name, 120),
      cue: cleanText(confirmed.cue, 420),
      sets: cleanText(confirmed.sets, 180),
      cat: cleanText(confirmed.cat, 20) === 'strength' ? 'strength' : 'mobility',
      imageSearch: cleanText(confirmed.imageSearch, 180),
      confidence: cleanText(confirmed.confidence, 60),
      nextStep: cleanText(confirmed.nextStep, 160),
      tips: cleanOptions(confirmed.tips),
    } : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) return NextResponse.json({ error: 'Missing GROQ_KEY_PTMOTIVATOR' }, { status: 500 });

    const { question, history, exercises, clarificationCount } = await req.json();
    const cleanQuestion = cleanText(question, 900);
    if (!cleanQuestion) return NextResponse.json({ error: 'Question required' }, { status: 400 });

    const cleanHistory: ChatMessage[] = Array.isArray(history)
      ? history.slice(-4).map((msg: ChatMessage): ChatMessage => ({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: cleanText(msg.content, 280) })).filter((msg: ChatMessage) => msg.content)
      : [];

    const exerciseContext = Array.isArray(exercises) ? exercises.slice(0, 40) : [];
    const cleanClarificationCount = Math.max(0, Math.min(2, Number(clarificationCount) || 0));

    const system = [
      'You are a world-class physical therapist and exercise coach helping identify exactly which ankle/foot/lower-body exercise variation the user means.',
      'Be concise: answer in 1 short sentence unless a confirmed draft is needed.',
      'Your main job is disambiguation. Ask at most one clarifying question. Provide 2-3 selectable options as short answer choices, not questions; no question marks in options.',
      'Assume the user is currently focused on ankle rehab, but consider hip, calf, foot intrinsic, balance, and lower-body strength links when relevant.',
      'Do not diagnose or replace clinician advice. Use conservative safety language only when useful.',
      'After 2 clarification rounds, stop asking and give the best likely confirmedExercise or a brief answer with options: [].',
      'When confident, include confirmedExercise with app-ready name, cue, sets, category, imageSearch, and 2-3 tips. Then use options: [].',
      'Return compact JSON only: {"answer":"","options":[],"confirmedExercise":{"name":"","cue":"","sets":"","cat":"mobility","imageSearch":"","confidence":"","nextStep":"","tips":[]}}. Omit confirmedExercise if not confident.',
    ].join(' ');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ currentQuestion: cleanQuestion, clarificationRound: cleanClarificationCount, maxClarificationRounds: 2, history: cleanHistory, exerciseLibrary: exerciseContext }) },
        ],
        temperature: 0.22,
        max_completion_tokens: 520,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const detail = groqDetailFromText(await res.text());
      return NextResponse.json({ error: `Groq ${res.status} ${res.statusText || 'request failed'}`.trim(), detail }, { status: 502 });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    return NextResponse.json({ reply: normalizeReply(jsonFromText(content), cleanClarificationCount < 2), model: MODEL });
  } catch (err) {
    console.error('[ai-exercise-question]', err);
    return NextResponse.json({ error: 'AI exercise question failed' }, { status: 500 });
  }
}
