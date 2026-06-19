import { NextRequest, NextResponse } from 'next/server';

type ExerciseBrief = {
  id: string;
  name: string;
  category?: string;
  sets?: string;
  done?: boolean;
  note?: string;
};

const MODEL = process.env.GROQ_MODEL_PTMOTIVATOR || 'llama-3.3-70b-versatile';

function cleanText(value: unknown, limit = 900) {
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

    const { text, exercises = [], health = {} } = await req.json();
    const safeExercises: ExerciseBrief[] = Array.isArray(exercises) ? exercises.slice(0, 80).map((ex: ExerciseBrief) => ({
      id: cleanText(ex.id, 60),
      name: cleanText(ex.name, 80),
      category: cleanText(ex.category, 50),
      sets: cleanText(ex.sets, 80),
      done: !!ex.done,
      note: cleanText(ex.note, 120),
    })) : [];

    const system = [
      'You convert a PT diary into proposed app changes. Return JSON only.',
      'Allowed exercise ids are provided; never invent ids. If unclear, ask in questions and do not change that item.',
      'Default: if user says they did an exercise, set completed true. If skipped/not done, set false.',
      'Notes should be concise and standardized: "sets x reps/time, leg/body part, details" like "2 x 60 seconds, both legs, straight and bent."',
      'Health numeric ranges: sleep_hours 0-12, sleep_quality/energy/mood/pain 0-10, decimals allowed.',
      'Output shape: {"summary":string[],"exerciseChanges":[{"id":string,"completed":boolean|null,"note":string|null,"reason":string}],"healthChanges":{},"questions":string[]}.',
      'healthChanges allowed keys: sleep_hours,sleep_quality,energy,mood,pain,sleep_notes,sleep_quality_notes,energy_notes,mood_notes,pain_notes,general_notes,treatment_notes.',
      'Only include changed fields. Keep JSON compact.'
    ].join(' ');

    const userPayload = JSON.stringify({
      diary: cleanText(text, 1200),
      exercises: safeExercises,
      health,
    });

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
          { role: 'user', content: userPayload },
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

    const allowed = new Set(safeExercises.map(ex => ex.id));
    const exerciseChanges = Array.isArray(parsed.exerciseChanges)
      ? parsed.exerciseChanges
          .filter((change: { id?: string }) => change?.id && allowed.has(change.id))
          .slice(0, 40)
      : [];

    return NextResponse.json({
      summary: Array.isArray(parsed.summary) ? parsed.summary.slice(0, 8) : [],
      exerciseChanges,
      healthChanges: parsed.healthChanges && typeof parsed.healthChanges === 'object' ? parsed.healthChanges : {},
      questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 8) : [],
      model: MODEL,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'AI parse failed' }, { status: 500 });
  }
}
