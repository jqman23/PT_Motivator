import { NextRequest, NextResponse } from 'next/server';

const MODEL = process.env.GROQ_MODEL_PTMOTIVATOR || 'llama-3.3-70b-versatile';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function cleanText(value: unknown, limit = 1200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanOptions(value: unknown) {
  return Array.isArray(value) ? value.map(item => cleanText(item, 180)).filter(Boolean).slice(0, 5) : [];
}

function jsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object returned');
  return JSON.parse(match[0]);
}

function normalizeReply(raw: Record<string, unknown>) {
  const confirmed = raw.confirmedExercise && typeof raw.confirmedExercise === 'object'
    ? raw.confirmedExercise as Record<string, unknown>
    : null;

  return {
    answer: cleanText(raw.answer, 360) || 'I can help narrow it down. Which version sounds closest?',
    options: cleanOptions(raw.options),
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

    const { question, history, exercises } = await req.json();
    const cleanQuestion = cleanText(question, 900);
    if (!cleanQuestion) return NextResponse.json({ error: 'Question required' }, { status: 400 });

    const cleanHistory: ChatMessage[] = Array.isArray(history)
      ? history.slice(-8).map((msg: ChatMessage): ChatMessage => ({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: cleanText(msg.content, 500) })).filter((msg: ChatMessage) => msg.content)
      : [];

    const exerciseContext = Array.isArray(exercises) ? exercises.slice(0, 80) : [];

    const system = [
      'You are a world-class physical therapist and exercise coach helping identify exactly which ankle/foot/lower-body exercise variation the user means.',
      'Be conversational but concise: answer in 1-2 short sentences unless a confirmed draft is needed.',
      'Your main job is disambiguation. Ask smart clarifying questions using 2-5 selectable options that reveal equipment, body position, joint action, anchor direction, rep style, target sensation, and progression/regression.',
      'Assume the user is currently focused on ankle rehab, but consider hip, calf, foot intrinsic, balance, and lower-body strength links when relevant.',
      'Do not diagnose or replace clinician advice. Use conservative safety language only when useful.',
      'When you are confident what the exercise is, include confirmedExercise with a clean app-ready name, cue, sets, category, imageSearch, and 3-5 tips. Still include options such as Edit this existing exercise, Add as new variation, Keep clarifying, or Stop here.',
      'Return JSON only: {"answer":"","options":[],"confirmedExercise":{"name":"","cue":"","sets":"","cat":"mobility","imageSearch":"","confidence":"","nextStep":"","tips":[]}}. Omit confirmedExercise if not confident.',
    ].join(' ');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ currentQuestion: cleanQuestion, history: cleanHistory, currentExerciseLibrary: exerciseContext }) },
        ],
        temperature: 0.22,
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
    return NextResponse.json({ reply: normalizeReply(jsonFromText(content)), model: MODEL });
  } catch (err) {
    console.error('[ai-exercise-question]', err);
    return NextResponse.json({ error: 'AI exercise question failed' }, { status: 500 });
  }
}
