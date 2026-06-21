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

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) return NextResponse.json({ error: 'Missing GROQ_KEY_PTMOTIVATOR' }, { status: 500 });

    const { text, exercises = [], health = {} } = await req.json();
    const diaryText = cleanText(text, 1800);
    const safeExercises: ExerciseBrief[] = Array.isArray(exercises) ? exercises.slice(0, 100).map((ex: ExerciseBrief) => ({
      id: cleanText(ex.id, 60),
      name: cleanText(ex.name, 90),
      category: cleanText(ex.category, 60),
      sets: cleanText(ex.sets, 120),
      done: !!ex.done,
      note: cleanText(ex.note, 160),
    })) : [];
    const categories = Array.from(new Set(safeExercises.map(ex => ex.category).filter(Boolean))).slice(0, 12);
    const splitIntent = /\b(split|break\s*(it|this)?\s*(up|down)|separate|specific|variants?|versions?|make .*\b\d+\b|\b\d+\s+(specific|separate|different))\b/i.test(diaryText);

    const system = [
      'You are the PT Motivator smart-add assistant. Convert the user note into proposed app changes. Return compact JSON only.',
      'The user may be logging today, creating new exercises, editing intent, or asking to split one broad exercise into multiple specific exercises.',
      'Use existing exercise ids in exerciseChanges when the note clearly refers to an existing exercise. Never invent ids in exerciseChanges.',
      'Use newExercises for exercises not already present. Choose categoryName from the provided categories exactly.',
      'Decomposition rule: if the user asks to split/break down/separate a broad/general exercise, create multiple newExercises, usually 2-5, each with a distinct name, purpose, dosage, cue, and tips. Do not collapse the request into one generic exercise.',
      'When splitting, make each exercise atomic: one movement pattern, one setup, one clear cue. Example broad terms like nerve glide, balance work, foot intrinsic work, ankle mobility, calf work, or metatarsalgia work should become specific variants when the user asks.',
      'If the user names a target count such as 3 specific exercises, return that many newExercises unless unsafe or impossible.',
      'Do not ask a question when the request is clear enough to draft safe editable proposals. Use questions only for missing critical details that affect safety or meaning.',
      'Default: did exercise => completed true; skipped/not done => false. For newly proposed library exercises that were not performed today, completed should be null.',
      'Notes format for completed exercises: "sets x reps/time, leg/body part, details" e.g. "2 x 60 seconds, both legs, straight and bent."',
      'For newExercises, sets should be concise dosage; cue should be user-facing form/setup; tips should be 2-5 short safety/form bullets.',
      'Avoid diagnosis, aggressive progression, or medical certainty. Keep PT wording practical and editable.',
      'Health ranges: sleep_hours 0-12; sleep_quality/energy/mood/pain 0-10.',
      'JSON shape: {"summary":[],"exerciseChanges":[{"id":"","completed":true,"note":"","reason":""}],"newExercises":[{"name":"","categoryName":"","sets":"","cue":"","tips":[],"note":"","completed":null,"reason":""}],"healthChanges":{},"questions":[]}.',
      'healthChanges keys: sleep_hours,sleep_quality,energy,mood,pain,sleep_notes,sleep_quality_notes,energy_notes,mood_notes,pain_notes,general_notes,treatment_notes.',
      'Only include fields you are adding/updating. Do not echo unchanged data.'
    ].join(' ');

    const userPayload = JSON.stringify({
      diary: diaryText,
      categories,
      splitIntent,
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
        temperature: splitIntent ? 0.18 : 0.1,
        max_completion_tokens: splitIntent ? 1800 : 1300,
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
            name: cleanText(item.name, 90),
            categoryName: categorySet.has(cleanText(item.categoryName, 60)) ? cleanText(item.categoryName, 60) : categories[0],
            sets: cleanText(item.sets, 120),
            cue: cleanText(item.cue, 240),
            tips: cleanList(item.tips, 6, 180),
            note: cleanText(item.note, 180),
            completed: typeof item.completed === 'boolean' ? item.completed : null,
            reason: cleanText(item.reason, 180),
          }))
          .filter((item: { name: string }) => item.name)
          .slice(0, 10)
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
