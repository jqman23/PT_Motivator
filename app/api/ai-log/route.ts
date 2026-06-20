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
    const categories = Array.from(new Set(safeExercises.map(ex => ex.category).filter(Boolean))).slice(0, 12);

    const system = [
      'PT diary to proposed app changes. Return compact JSON only.',
      'Use existing exercise ids when possible; never invent ids in exerciseChanges.',
      'If clearly a new exercise, use newExercises; choose a categoryName from categories. If unsure, ask a question instead.',
      'Default: did exercise => completed true; skipped/not done => false.',
      'Notes format: "sets x reps/time, leg/body part, details" e.g. "2 x 60 seconds, both legs, straight and bent."',
      'Health ranges: sleep_hours 0-12; sleep_quality/energy/mood/pain 0-10.',
      'JSON shape: {"summary":[],"exerciseChanges":[{"id":"","completed":true,"note":"","reason":""}],"newExercises":[{"name":"","categoryName":"","sets":"","cue":"","note":"","completed":true,"reason":""}],"healthChanges":{},"questions":[]}.',
      'healthChanges keys: sleep_hours,sleep_quality,energy,mood,pain,sleep_notes,sleep_quality_notes,energy_notes,mood_notes,pain_notes,general_notes,treatment_notes.',
      'Only include fields you are adding/updating. Do not echo unchanged data.'
    ].join(' ');

    const userPayload = JSON.stringify({
      diary: cleanText(text, 1200),
      categories,
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
        max_completion_tokens: 1000,
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
    const categorySet = new Set(categories);
    const newExercises = Array.isArray(parsed.newExercises)
      ? parsed.newExercises
          .map((item: Record<string, unknown>) => ({
            name: cleanText(item.name, 80),
            categoryName: categorySet.has(cleanText(item.categoryName, 50)) ? cleanText(item.categoryName, 50) : categories[0],
            sets: cleanText(item.sets, 90),
            cue: cleanText(item.cue, 140),
            note: cleanText(item.note, 140),
            completed: typeof item.completed === 'boolean' ? item.completed : null,
            reason: cleanText(item.reason, 120),
          }))
          .filter((item: { name: string }) => item.name)
          .slice(0, 8)
      : [];

    return NextResponse.json({
      summary: Array.isArray(parsed.summary) ? parsed.summary.slice(0, 8) : [],
      exerciseChanges,
      newExercises,
      healthChanges: parsed.healthChanges && typeof parsed.healthChanges === 'object' ? parsed.healthChanges : {},
      questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 8) : [],
      model: MODEL,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'AI parse failed' }, { status: 500 });
  }
}
