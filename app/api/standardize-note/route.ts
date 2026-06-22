import { NextRequest, NextResponse } from 'next/server';

const MODEL = process.env.GROQ_MODEL_PTMOTIVATOR || 'llama-3.3-70b-versatile';

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
      'Use this grammar: dose, target/body part/side, variation/component, modifier, outcome/descriptor.',
      'The standardizedNote should be one comma-separated line. Put dose first whenever dose is stated or strongly implied.',
      'Examples: "2 × 60 sec, right + left leg, inversion + eversion, no band"; "1 × 60 sec, big toe + toe spread + arch lift"; "3 × 12, right ankle, slow controlled".',
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
    const standardizedNote = cleanText(parsed.standardizedNote || rawNote, 260);
    const fields: StandardizedFields = parsed.fields && typeof parsed.fields === 'object' ? {
      dose: cleanText(parsed.fields.dose, 80),
      target: cleanText(parsed.fields.target, 100),
      variation: cleanText(parsed.fields.variation, 120),
      modifier: cleanText(parsed.fields.modifier, 120),
      outcome: cleanText(parsed.fields.outcome, 120),
    } : {};

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
