import { NextRequest, NextResponse } from 'next/server';
import { getRecentNotes } from '@/lib/db';
import { callGroqChat, getGroqModelChain, groqErrorPayload } from '@/lib/groq';
import { stripSecretNotes } from '@/lib/secretNotes';

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
  recentNotes?: string[];
};

type SourceMatch = {
  source?: string;
  sourceId?: string;
  name?: string;
  sets?: string;
  cue?: string;
  tips?: string[];
  label?: string;
};

const DEFAULT_MODEL = getGroqModelChain('log')[0];

function cleanText(value: unknown, limit = 900) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function stripGenericAiFiller(value: string) {
  return value
    .replace(/\bkeep\s+(your\s+)?back\s+straight\b[,. ]*/gi, '')
    .replace(/\bmaintain\s+(a\s+)?(straight\s+back|neutral\s+spine)\b[,. ]*/gi, '')
    .replace(/\b(engage|brace)\s+(your\s+)?core\b[,. ]*/gi, '')
    .replace(/\bkeep\s+(your\s+)?core\s+engaged\b[,. ]*/gi, '')
    .replace(/\bbreathe\s+naturally\b[,. ]*/gi, '')
    .replace(/\bsit\s+(up\s+)?tall\b[,. ]*/gi, '')
    .replace(/\bupright\s+posture\b[,. ]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[,.;:]\s*/, '')
    .trim();
}

function cleanList(value: unknown, limit = 8, itemLimit = 180) {
  return Array.isArray(value)
    ? value.map(item => cleanText(item, itemLimit)).filter(Boolean).slice(0, limit)
    : [];
}

function cleanGeneratedTips(value: unknown, limit = 6, itemLimit = 180) {
  return cleanList(value, limit, itemLimit)
    .map(stripGenericAiFiller)
    .filter(Boolean)
    .slice(0, limit);
}

function cleanSourceMatches(value: unknown): SourceMatch[] {
  return Array.isArray(value)
    ? value.slice(0, 8).map((match: SourceMatch) => ({
        source: cleanText(match?.source, 24),
        sourceId: cleanText(match?.sourceId, 90),
        name: cleanText(match?.name, 120),
        sets: cleanText(match?.sets, 120),
        cue: cleanText(match?.cue, 260),
        tips: cleanList(match?.tips, 5, 140),
        label: cleanText(match?.label, 40),
      })).filter(match => match.name)
    : [];
}

function validOrigin(value: unknown) {
  const cleaned = cleanText(value, 24);
  return cleaned === 'exercisedb' || cleaned === 'api_ninjas' || cleaned === 'patient_added' ? cleaned : undefined;
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

function inferIntentHints(text: string) {
  const lower = text.toLowerCase();
  const hints: string[] = [];
  if (/(elevated|step|stairs?|ledge|box|platform|surface).*(one|single|leg|foot|heel|calf|ankle|up|down|raise|lower)|(?:one|single|leg|foot|heel|calf|ankle|up|down|raise|lower).*(elevated|step|stairs?|ledge|box|platform|surface)/i.test(lower)) {
    hints.push('Likely canonical exercise: single-leg calf raise off step. If user emphasizes slow lowering or heel dropping below the step, consider eccentric heel drop.');
  }
  if (/(heel|calf).*(drop|lower|down|eccentric)|slow.*lower.*heel/i.test(lower)) {
    hints.push('Likely canonical exercise: eccentric heel drop / eccentric calf raise.');
  }
  if (/(nerve|floss|glide|sciatic|slump)|(?:leg.*90.*knee.*bend.*foot.*flex)/i.test(lower)) {
    hints.push('Likely canonical exercise: sciatic nerve glide / nerve floss. Use gentle motion, not a static stretch.');
  }
  if (/(band|theraband).*(ankle|foot).*(in|out|side|eversion|inversion)|(?:ankle|foot).*(in|out|side|eversion|inversion).*(band|theraband)/i.test(lower)) {
    hints.push('Likely canonical exercise: banded ankle eversion/inversion.');
  }
  if (/(pillow|foam|cushion|unstable|balance pad).*(one|single|leg|foot|stand)|(?:one|single|leg|foot|stand).*(pillow|foam|cushion|unstable|balance pad)/i.test(lower)) {
    hints.push('Likely canonical exercise: single-leg balance on unstable surface.');
  }
  if (/(toe).*(spread|yoga|lift|big toe|little toes)/i.test(lower)) {
    hints.push('Likely canonical exercise: toe yoga / intrinsic foot strengthening.');
  }
  return hints.slice(0, 6);
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err ?? 'Unknown error');
}

export async function POST(req: NextRequest) {
  let activeModel = DEFAULT_MODEL;
  let attemptedModels: string[] = [];

  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) {
      return NextResponse.json({
        error: 'Missing GROQ_KEY_PTMOTIVATOR',
        detail: 'The server environment variable GROQ_KEY_PTMOTIVATOR is not set, so AI Add cannot call Groq.',
        model: DEFAULT_MODEL,
      }, { status: 500 });
    }

    const { text, exercises = [], health = {}, draftProposal = null, sourceMatches: rawSourceMatches = [], date: requestDate } = await req.json();
    const diaryText = cleanText(text, 1800);
    const sourceMatches = cleanSourceMatches(rawSourceMatches).slice(0, 5);
    const inferredIntentHints = inferIntentHints(diaryText);
    const todayDate: string = typeof requestDate === 'string' && requestDate.match(/^\d{4}-\d{2}-\d{2}$/)
      ? requestDate
      : new Date().toISOString().split('T')[0];

    const rawExercises: ExerciseBrief[] = Array.isArray(exercises) ? exercises : [];
    const safeExercises: ExerciseBrief[] = rawExercises.slice(0, 45).map((ex: ExerciseBrief) => {
      const safe: ExerciseBrief = {
        id: cleanText(ex.id, 60),
        name: cleanText(ex.name, 70),
        category: cleanText(ex.category, 60),
        sets: cleanText(ex.sets, 80),
        cue: cleanText(ex.cue, 120),
        tips: cleanList(ex.tips, 2, 80),
        done: !!ex.done,
        note: cleanText(stripSecretNotes(ex.note), 80),
      };
      safe.schemaText = makeSchemaText(safe);
      return safe;
    });

    // Fetch recent note history for completed exercises to guide style consistency.
    const completedExercises = safeExercises.filter(ex => ex.done && ex.id).slice(0, 8);
    if (completedExercises.length > 0) {
      const histories = await Promise.all(
        completedExercises.map(ex => getRecentNotes(ex.id, todayDate).catch(() => []))
      );
      for (let i = 0; i < completedExercises.length; i++) {
        const notes = histories[i].map(r => stripSecretNotes(r.note)).filter(Boolean).slice(0, 3);
        if (notes.length > 0) completedExercises[i].recentNotes = notes;
      }
    }

    const categories = Array.from(new Set(safeExercises.map(ex => ex.category).filter(Boolean))).slice(0, 12);
    const splitIntent = /\b(split|break\s*(it|this)?\s*(up|down)|separate|specific|variants?|versions?|make .*\b\d+\b|\b\d+\s+(specific|separate|different))\b/i.test(diaryText);
    const updateOnlyIntent = /\b(just\s+update|update\s+only|only\s+update|can't\s+create|cannot\s+create|do\s+not\s+create|don't\s+create|no\s+new|existing\s+only|current\s+only|update\s+(the|this|that|existing|current)|change\s+(the|this|that|existing|current)|edit\s+(the|this|that|existing|current)|modify\s+(the|this|that|existing|current)|revise\s+(the|this|that|existing|current))\b/i.test(diaryText);

    const system = [
      'Return compact JSON only for PT Motivator smart add.',
      'Interpret rough user wording as clues, not final text. Map layperson descriptions to canonical PT/exercise names.',
      'Examples: elevated surface + one leg + up/down => Single-leg calf raise off step; slow heel lowering/drop below step => Eccentric heel drop; lying leg 90/knee bend/foot flex => Supine sciatic nerve glide; band ankle in/out => Banded ankle eversion/inversion; pillow/foam one-foot stand => Single-leg balance on unstable surface.',
      'If two materially different exercises fit, ask one targeted question with 2-3 canonical clarificationOptions. Otherwise draft the best likely exercise.',
      'Use sourceMatches and inferredIntentHints when relevant. Do not choose unrelated sources.',
      'For existing exercise updates use exerciseChanges with real ids only. For new library items use newExercises.',
      'If updateOnlyIntent is true, return no newExercises; ask if the existing exercise is unclear.',
      'Fields: name canonical; sets concise dosage; cue clear setup/form; tips 2-5 specific non-generic bullets; note only today performance.',
      'Avoid generic filler: breathe naturally, engage core, keep back straight, neutral spine, sit tall unless specifically relevant.',
      'Use categoryName exactly from categories. completed true only if performed today; null if just creating library item.',
      'JSON shape: {"summary":[],"exerciseChanges":[{"id":"","completed":true,"note":"","reason":""}],"newExercises":[{"name":"","categoryName":"","sets":"","cue":"","tips":[],"note":"","completed":null,"reason":"","origin":"patient_added|exercisedb|api_ninjas","sourceId":"","dbMatches":[]}],"healthChanges":{},"questions":[],"clarificationOptions":[{"label":"","value":""}]}',
    ].join(' ');

    const userPayload = JSON.stringify({
      diary: diaryText,
      categories,
      splitIntent,
      updateOnlyIntent,
      draftProposal,
      exercises: safeExercises,
      sourceMatches,
      inferredIntentHints,
      health,
    });

    const { data, model, attemptedModels: triedModels } = await callGroqChat(apiKey, 'log', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPayload },
      ],
      temperature: splitIntent || draftProposal ? 0.2 : 0.12,
      max_completion_tokens: splitIntent || draftProposal || sourceMatches.length ? 1400 : 1000,
      response_format: { type: 'json_object' },
    });
    activeModel = model;
    attemptedModels = triedModels;

    const content = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any;
    try {
      parsed = jsonFromText(content);
    } catch (parseErr) {
      return NextResponse.json({
        error: 'AI returned invalid JSON',
        detail: errorMessage(parseErr),
        rawModelOutput: cleanText(content, 1200),
        model: activeModel,
        attemptedModels,
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
            cue: stripGenericAiFiller(cleanText(item.cue, 240)),
            tips: cleanGeneratedTips(item.tips, 6, 180),
            note: cleanText(item.note, 180),
            completed: typeof item.completed === 'boolean' ? item.completed : null,
            reason: cleanText(item.reason, 180),
            origin: validOrigin(item.origin),
            sourceId: cleanText(item.sourceId, 120),
            dbMatches: cleanSourceMatches(item.dbMatches).slice(0, 3),
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
      model: activeModel,
      attemptedModels,
    });
  } catch (err) {
    console.error(err);
    const payload = groqErrorPayload(err);
    if (payload.error === 'Groq request failed') {
      return NextResponse.json({ ...payload, model: payload.model ?? activeModel }, { status: 502 });
    }
    return NextResponse.json({
      error: 'AI parse failed',
      detail: errorMessage(err),
      model: activeModel,
      attemptedModels,
    }, { status: 500 });
  }
}
