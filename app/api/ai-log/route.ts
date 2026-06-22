import { NextRequest, NextResponse } from 'next/server';

type ExerciseBrief = {
  id: string;
  name: string;
  category?: string;
  sets?: string;
  cue?: string;
  tips?: string[];
  schemaText?: string;
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

function makeSchemaText(ex: ExerciseBrief) {
  return cleanText([
    ex.sets ? `sets: ${ex.sets}` : '',
    ex.cue ? `cue: ${ex.cue}` : '',
    ...(Array.isArray(ex.tips) ? ex.tips.map(tip => `tip: ${tip}`) : []),
  ].filter(Boolean).join('; '), 420);
}

function groqDetailFromText(text: string) {
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message || parsed?.detail || text;
    const type = parsed?.error?.type || parsed?.type;
    const code = parsed?.error?.code || parsed?.code;
    return [message, type ? `type: ${type}` : '', code ? `code: ${code}` : ''].filter(Boolean).join(' | ');
  } catch {
    return text;
  }
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err ?? 'Unknown error');
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) {
      return NextResponse.json({
        error: 'Missing GROQ_KEY_PTMOTIVATOR',
        detail: 'The server environment variable GROQ_KEY_PTMOTIVATOR is not set, so AI Add cannot call Groq.',
        model: MODEL,
      }, { status: 500 });
    }

    const { text, exercises = [], health = {}, draftProposal = null } = await req.json();
    const diaryText = cleanText(text, 1800);
    const safeExercises: ExerciseBrief[] = Array.isArray(exercises) ? exercises.slice(0, 100).map((ex: ExerciseBrief) => {
      const safe: ExerciseBrief = {
        id: cleanText(ex.id, 60),
        name: cleanText(ex.name, 90),
        category: cleanText(ex.category, 60),
        sets: cleanText(ex.sets, 120),
        cue: cleanText(ex.cue, 220),
        tips: cleanList(ex.tips, 5, 120),
        done: !!ex.done,
        note: cleanText(ex.note, 160),
      };
      safe.schemaText = makeSchemaText(safe);
      return safe;
    }) : [];
    const categories = Array.from(new Set(safeExercises.map(ex => ex.category).filter(Boolean))).slice(0, 12);
    const splitIntent = /\b(split|break\s*(it|this)?\s*(up|down)|separate|specific|variants?|versions?|make .*\b\d+\b|\b\d+\s+(specific|separate|different))\b/i.test(diaryText);
    const updateOnlyIntent = /\b(just\s+update|update\s+only|only\s+update|can't\s+create|cannot\s+create|do\s+not\s+create|don't\s+create|no\s+new|existing\s+only|current\s+only|update\s+(the|this|that|existing|current)|change\s+(the|this|that|existing|current)|edit\s+(the|this|that|existing|current)|modify\s+(the|this|that|existing|current)|revise\s+(the|this|that|existing|current))\b/i.test(diaryText);

    const system = [
      'You are the PT Motivator smart-add assistant. Convert the user note into proposed app changes. Return compact JSON only.',
      'Think like an exercise interpreter, not a stenographer. First infer the exercise concept, then write clean app fields from that inferred concept.',
      'Important: interpretation never overrides note structure. After interpreting, every exercise note must still follow: dosage first, then body part/side/component, then descriptor or context. Use comma-separated fragments, not long sentences.',
      'General note structure examples: "1 x ~60 seconds, big toe, toe spread, and arch lift"; "1 x 60 seconds, both legs, straight and bent"; "3 x 12, right ankle, slow controlled"; "2 x 10 each side, hips, banded".',
      'For any messy new exercise description, internally identify: body position, target body area or nerve/muscle, action pair, side/body part, dosage, and intent. Then output a canonical name, standardized sets, clean cue, and tips.',
      'You may add standard inferred wording that the user did not explicitly say when it is strongly implied by the movement. Example: if user describes a lying-down leg movement with knee bend/straighten and ankle flex/point, infer a supine nerve glide / nerve floss pattern and write it clearly.',
      'Do not merely transcribe messy user wording. Infer the likely common exercise from rough descriptions, then normalize it into clean app language.',
      'Use ordinary exercise and PT vocabulary to simplify messy movement descriptions into canonical names, concise dosage, clear setup cues, and short tips.',
      'If a rough description strongly matches one common exercise, produce the likely normalized exercise. Ask a question only when multiple materially different exercises are plausible or an essential detail is missing.',
      'Example normalization: a rough description like lying down, leg around 90 degrees, knee bends and straightens, foot flexes one way then the other should become a concise nerve glide / nerve floss style exercise with a clear name and clean cue, not a literal run-on sentence.',
      'If draftProposal is provided, treat the user text as a revision to that pending draft. Preserve existing draft items unless the user asks to change or remove them. Return the full updated draft.',
      'If the request is unclear, return one question and 2-3 clarificationOptions. For clarification-only responses, return no changes.',
      'Use existing exercise ids in exerciseChanges when the note clearly refers to an existing exercise. Never invent ids in exerciseChanges.',
      'Use newExercises only when the user clearly wants a new exercise/library item or a split into new specific exercises. Choose categoryName from the provided categories exactly.',
      'UPDATE-ONLY RULE: if updateOnlyIntent is true, or the user says update/change/edit/modify/revise an existing/current exercise, just update, update only, no new, do not create, cannot create, or can\'t create, return zero newExercises. Use exerciseChanges only. If you cannot confidently match the existing exercise, ask a clarification question instead of creating a new exercise.',
      'When updating an existing exercise note, use that exercise\'s saved schemaText first, then name/sets/cue/tips. schemaText is the compact source of truth for what the exercise contains.',
      'If the user says "all", "all 3", "both", "straight and bent", "each", or similar shorthand, expand it from schemaText/cue/tips instead of copying vague user wording.',
      'For exerciseChanges.note, write a concise standardized performed-today note. Use dosage first, then the exercised part/component, then descriptor. Examples: "1 x ~60 seconds, listed components from cue", "1 x 60 seconds, both legs, straight and bent", "3 x 12, right ankle, slow controlled".',
      'For newExercises.name, prefer canonical names: position + body area/component + movement type. Examples: "Supine nerve glide", "Seated nerve glide", "Standing calf stretch", "Toe yoga".',
      'For newExercises.sets, use standardized dosage only. If user did not give dosage, choose a simple conservative default only when obvious; otherwise ask.',
      'For newExercises.cue, simplify the movement into clear form language. Do not preserve rambling language. The cue should sound like the app knows the exercise, not like it is quoting the user.',
      'Do not include filler phrases like "did all", "in it", "approx 1 set", "where lying down", or "leg bends then straightens up flexing" in final notes/cues. Convert them into standard components and form cues.',
      'If the user gives approximate timing, use ~, e.g. "1 x ~60 seconds". Prefer seconds over min in standardized notes when timing is specific.',
      'If the user asks to split a broad exercise and updateOnlyIntent is false, create multiple newExercises, usually 2-5.',
      'Default: did exercise means completed true; skipped/not done means false. For newly proposed library exercises that were not performed today, completed should be null.',
      'Use standard PT nomenclature. Put new exercise dosage in sets as: sets x reps/time, body part/side, descriptor. Examples: "1 x 60 seconds, both legs, straight and bent", "3 x 12, right ankle, slow controlled", "2 x 10 each side, hips, banded".',
      'Use cue for setup/form details and note for what happened today.',
      'For newExercises, sets should be concise standardized dosage; cue should be user-facing form/setup; tips should be 2-5 short safety/form bullets.',
      'JSON shape: {"summary":[],"exerciseChanges":[{"id":"","completed":true,"note":"","reason":""}],"newExercises":[{"name":"","categoryName":"","sets":"","cue":"","tips":[],"note":"","completed":null,"reason":""}],"healthChanges":{},"questions":[],"clarificationOptions":[{"label":"","value":""}]}.',
      'Only include fields you are adding/updating. Do not echo unchanged saved data.'
    ].join(' ');

    const userPayload = JSON.stringify({
      diary: diaryText,
      categories,
      splitIntent,
      updateOnlyIntent,
      draftProposal,
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
        temperature: splitIntent || draftProposal ? 0.24 : 0.16,
        max_completion_tokens: splitIntent || draftProposal ? 2200 : 1600,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const rawDetail = await res.text();
      const requestId = res.headers.get('x-request-id') || res.headers.get('cf-ray') || '';
      const detail = groqDetailFromText(rawDetail);
      return NextResponse.json({
        error: 'Groq request failed',
        detail: cleanText(detail, 1200),
        groqStatus: res.status,
        groqStatusText: res.statusText,
        model: MODEL,
        requestId,
        hint: res.status === 401 ? 'Likely bad or missing Groq API key.'
          : res.status === 429 ? 'Groq rate limit or quota issue.'
          : res.status === 400 ? 'Groq rejected the request body, model, or response_format.'
          : 'Groq returned a non-OK response.',
      }, { status: 502 });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any;
    try {
      parsed = jsonFromText(content);
    } catch (parseErr) {
      return NextResponse.json({
        error: 'AI returned invalid JSON',
        detail: errorMessage(parseErr),
        rawModelOutput: cleanText(content, 1200),
        model: MODEL,
      }, { status: 502 });
    }

    const allowed = new Set(safeExercises.map(ex => ex.id));
    const exerciseChanges = Array.isArray(parsed.exerciseChanges)
      ? parsed.exerciseChanges
          .filter((change: { id?: string }) => change?.id && allowed.has(change.id))
          .slice(0, 40)
      : [];
    const categorySet = new Set(categories);
    const rawNewExercises = Array.isArray(parsed.newExercises) ? parsed.newExercises : [];
    const newExercises = updateOnlyIntent
      ? []
      : rawNewExercises
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
          .slice(0, 10);

    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 8) : [];
    if (updateOnlyIntent && rawNewExercises.length && !exerciseChanges.length) {
      questions.unshift('I treated this as update-only and did not create a new exercise. Which existing exercise should I update?');
    }

    return NextResponse.json({
      summary: Array.isArray(parsed.summary) ? parsed.summary.slice(0, 8) : [],
      exerciseChanges,
      newExercises,
      healthChanges: parsed.healthChanges && typeof parsed.healthChanges === 'object' ? parsed.healthChanges : {},
      questions: questions.slice(0, 8),
      clarificationOptions: Array.isArray(parsed.clarificationOptions) ? parsed.clarificationOptions.slice(0, 3) : [],
      model: MODEL,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      error: 'AI parse failed',
      detail: errorMessage(err),
      model: MODEL,
    }, { status: 500 });
  }
}
