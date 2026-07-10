import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_GROQ_MODELS = new Set([
  'canopylabs/orpheus-arabic-saudi',
  'canopylabs/orpheus-v1-english',
  'groq/compound',
  'groq/compound-mini',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-prompt-guard-2-22m',
  'meta-llama/llama-prompt-guard-2-86m',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-safeguard-20b',
  'qwen/qwen3-32b',
  'qwen/qwen3.6-27b',
  'whisper-large-v3',
  'whisper-large-v3-turbo',
]);

const MODEL = ALLOWED_GROQ_MODELS.has(process.env.GROQ_MODEL_PTMOTIVATOR ?? '')
  ? process.env.GROQ_MODEL_PTMOTIVATOR!
  : 'llama-3.3-70b-versatile';

type StandardizedFields = {
  dose?: string;
  target?: string;
  variation?: string;
  modifier?: string;
  outcome?: string;
};

function cleanText(value: unknown, limit = 1200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanStringList(value: unknown, limit = 8, itemLimit = 180) {
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

function localFallback(note: string) {
  return cleanText(note, 220);
}

function splitParts(value: string) {
  return cleanText(value, 260)
    .split(/[,;]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function isKnownModifier(value: string) {
  return /\b(no band|without band|with band|banded|yellow band|red band|green band|blue band|black band|light band|heavy band|no support|wall support|hand support|shoes on|barefoot|no shoes|no weight|bodyweight|weighted|assisted|unassisted)\b/i.test(value);
}

function isLikelyOutcome(value: string) {
  return /\b(easy|moderate|moderately|hard|difficult|pain|painful|sore|tight|better|worse|stable|unstable|burning|tingling|felt|improved|irritated)\b/i.test(value);
}

function pullEmbeddedModifier(value: string) {
  const text = cleanText(value, 260);
  const embedded = text.match(/\b(no band|without band|with band|banded|yellow band|red band|green band|blue band|black band|light band|heavy band|no support|wall support|hand support|shoes on|barefoot|no shoes|no weight|bodyweight|weighted|assisted|unassisted)\b/i)?.[0];
  if (!embedded) return { text, modifier: '' };
  const remaining = cleanText(text.replace(new RegExp(`\\b${embedded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '').replace(/^[,\s]+|[,\s]+$/g, ''), 220);
  return { text: remaining, modifier: embedded.toLowerCase() };
}

function normalizeFields(fields: StandardizedFields): StandardizedFields {
  const modifierParts: string[] = [];
  const outcomeParts: string[] = [];

  for (const part of splitParts(fields.modifier ?? '')) {
    const embedded = pullEmbeddedModifier(part);
    if (embedded.modifier) modifierParts.push(embedded.modifier);
    if (embedded.text) {
      if (isLikelyOutcome(embedded.text) && !isKnownModifier(embedded.text)) outcomeParts.push(embedded.text);
      else modifierParts.push(embedded.text);
    }
  }

  for (const part of splitParts(fields.outcome ?? '')) {
    const embedded = pullEmbeddedModifier(part);
    if (embedded.modifier) modifierParts.push(embedded.modifier);
    if (embedded.text) outcomeParts.push(embedded.text);
  }

  const unique = (items: string[]) => Array.from(new Set(items.map(item => cleanText(item, 120)).filter(Boolean)));

  return {
    dose: cleanText(fields.dose, 80),
    target: cleanText(fields.target, 100),
    variation: cleanText(fields.variation, 120),
    modifier: unique(modifierParts).join(', '),
    outcome: unique(outcomeParts).join(', '),
  };
}

function assembleStandardizedNote(aiNote: string, fields: StandardizedFields) {
  const normalized = normalizeFields(fields);
  const parts = [normalized.dose, normalized.target, normalized.variation, normalized.modifier, normalized.outcome]
    .map(part => cleanText(part, 140))
    .filter(Boolean);
  return {
    fields: normalized,
    standardizedNote: parts.length >= 2 ? cleanText(parts.join(', '), 260) : cleanText(aiNote, 260),
  };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    const body = await req.json();
    const rawNote = cleanText(body.rawNote, 900);
    const exerciseName = cleanText(body.exerciseName, 120);
    const exerciseSets = cleanText(body.exerciseSets, 180);
    const exerciseCue = cleanText(body.exerciseCue, 240);
    const exerciseTips = cleanStringList(body.exerciseTips, 6, 160);
    const recentNotes = cleanStringList(body.recentNotes, 8, 220);
    const clarification = cleanText(body.clarification, 500);
    const previousStandardizedNote = cleanText(body.previousStandardizedNote, 260);
    const cleanupMode = !!body.cleanupMode;

    if (!rawNote) {
      return NextResponse.json({
        originalNote: '',
        standardizedNote: '',
        fields: {},
        changed: false,
        summary: [],
        questions: [],
        clarificationOptions: [],
      });
    }

    if (!apiKey) {
      const fallback = localFallback(rawNote);
      return NextResponse.json({
        originalNote: rawNote,
        standardizedNote: fallback,
        fields: {},
        changed: false,
        summary: ['AI standardization unavailable because GROQ_KEY_PTMOTIVATOR is missing.'],
        questions: [],
        clarificationOptions: [],
      });
    }

    const system = [
      'You standardize manual exercise notes for a tracking app. Return compact JSON only.',
      'Goal: convert messy free text into a short standardized note, while preserving the user meaning.',
      'Do not add advice. Do not invent symptoms. Only normalize the note.',
      'Use this strict grammar and order: dose, target/body part/side, variation/component, modifier, outcome/descriptor.',
      'Modifier must come before outcome. Never combine modifier and outcome in one field.',
      'The standardizedNote should be one comma-separated line. Put dose first whenever dose is stated or strongly implied.',
      'Examples: "2 × 60 sec, right + left leg, inversion + eversion, no band, moderately difficult"; "1 × 60 sec, big toe + toe spread + arch lift"; "3 × 12, right ankle, slow controlled".',
      'Use × not x. Use sec not seconds. Use + for combined sides/components. Prefer right + left over both when sides matter.',
      'If exercise schema, recent notes, or clarification make shorthand clear, use them.',
      'If one or more fields are unclear in cleanupMode, still produce the best standardizedNote from known info, and ask at most one short question for the most important missing field.',
      'Use clarificationOptions only for likely missing structure choices such as dose, side/target, variation, or modifier. Do not ask about outcome if it is not remembered.',
      'If the original is already clean, return it mostly unchanged, only normalizing punctuation/abbreviations.',
      'JSON shape: {"standardizedNote":"","fields":{"dose":"","target":"","variation":"","modifier":"","outcome":""},"summary":[],"changed":true,"questions":[],"clarificationOptions":[{"label":"","value":""}]}.',
    ].join(' ');

    const userPayload = JSON.stringify({
      rawNote,
      cleanupMode,
      clarification,
      previousStandardizedNote,
      exercise: {
        name: exerciseName,
        sets: exerciseSets,
        cue: exerciseCue,
        tips: exerciseTips,
      },
      recentNotes,
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
        temperature: cleanupMode ? 0.16 : 0.12,
        max_completion_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const detail = groqDetailFromText(await res.text());
      return NextResponse.json({
        error: 'Note standardization failed',
        detail: cleanText(detail, 900),
        groqStatus: res.status,
        groqStatusText: res.statusText,
        model: MODEL,
        originalNote: rawNote,
        standardizedNote: localFallback(rawNote),
        questions: [],
        clarificationOptions: [],
      }, { status: 502 });
    }

    const data = await res.json();
    const parsed = parseJson(data?.choices?.[0]?.message?.content ?? '{}');
    const rawStandardizedNote = cleanText(parsed.standardizedNote || rawNote, 260);
    const rawFields: StandardizedFields = parsed.fields && typeof parsed.fields === 'object' ? {
      dose: cleanText(parsed.fields.dose, 80),
      target: cleanText(parsed.fields.target, 100),
      variation: cleanText(parsed.fields.variation, 120),
      modifier: cleanText(parsed.fields.modifier, 120),
      outcome: cleanText(parsed.fields.outcome, 120),
    } : {};
    const { standardizedNote, fields } = assembleStandardizedNote(rawStandardizedNote, rawFields);

    const clarificationOptions = Array.isArray(parsed.clarificationOptions)
      ? parsed.clarificationOptions.map((option: { label?: unknown; value?: unknown } | string) => {
          if (typeof option === 'string') return { label: cleanText(option, 80), value: cleanText(option, 120) };
          return { label: cleanText(option?.label, 80), value: cleanText(option?.value ?? option?.label, 120) };
        }).filter((option: { label: string; value: string }) => option.label).slice(0, 4)
      : [];

    return NextResponse.json({
      originalNote: rawNote,
      standardizedNote,
      fields,
      summary: cleanStringList(parsed.summary, 5, 140),
      changed: typeof parsed.changed === 'boolean' ? parsed.changed : standardizedNote !== rawNote,
      questions: cleanStringList(parsed.questions, 2, 180),
      clarificationOptions,
      model: MODEL,
    });
  } catch (err) {
    return NextResponse.json({
      error: 'Note standardization failed',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
