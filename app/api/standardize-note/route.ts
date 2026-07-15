import { NextRequest, NextResponse } from 'next/server';
import { callGroqChat, getGroqApiKeys, groqErrorPayload, hasAiApiKeyForTask } from '@/lib/groq';
import { stripSecretNotes } from '@/lib/secretNotes';

type StandardizedFields = {
  experience?: string;
  symptoms?: string;
  context?: string;
  followUp?: string;
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

function localFallback(note: string) {
  return cleanText(note, 220);
}

export async function POST(req: NextRequest) {
  try {
    const apiKeys = getGroqApiKeys();
    const body = await req.json();
    const rawNote = cleanText(stripSecretNotes(body.rawNote), 900);
    const exerciseName = cleanText(body.exerciseName, 120);
    const exerciseSets = cleanText(body.exerciseSets, 180);
    const exerciseCue = cleanText(body.exerciseCue, 240);
    const exerciseTips = cleanStringList(body.exerciseTips, 6, 160);
    const recentNotes = cleanStringList(Array.isArray(body.recentNotes) ? body.recentNotes.map((note: unknown) => stripSecretNotes(String(note ?? ''))) : body.recentNotes, 8, 220);
    const clarification = cleanText(body.clarification, 500);
    const previousStandardizedNote = cleanText(body.previousStandardizedNote, 260);
    const cleanupMode = !!body.cleanupMode;
    const dailyMetric = body.dailyMetric && typeof body.dailyMetric === 'object' ? body.dailyMetric : null;

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

    if (!hasAiApiKeyForTask('standardize', apiKeys)) {
      const fallback = localFallback(rawNote);
      return NextResponse.json({
        originalNote: rawNote,
        standardizedNote: fallback,
        fields: {},
        changed: false,
        summary: ['AI standardization unavailable because no AI provider key is configured.'],
        questions: [],
        clarificationOptions: [],
      });
    }

    const system = [
      'You clean up personal exercise journal notes for later reference. Return compact JSON only.',
      'The structured metric system already stores sets, reps, duration, scope, and weight. Do not turn every note into a dosage record and do not inject programmed dosage into the note.',
      'The raw note is the primary evidence and every meaningful fact in it must survive cleanup. Preserve all explicit numbers, qualifiers, relationships, ordering, symptoms, comparisons, and uncertainty even when the writing is terse or fragmented.',
      'Resolve shorthand by reasoning about the relationships among the words, punctuation, ordered values, exercise context, and available daily metrics. Expand shorthand only when one interpretation is strongly supported, and preserve the original granularity and order.',
      'When multiple materially different interpretations remain plausible, retain the original information without forcing a meaning and ask one concise clarification.',
      'Preserve what the writer was trying to remember: how the exercise felt, pain or other symptoms during or afterward, difficulty, form or setup observations, modifications, confidence, progress, and anything to revisit.',
      'Correct dictation errors, fragments, repetition, spelling, and unclear punctuation. Produce one or two concise first-person sentences when that best preserves meaning.',
      'Keep useful specifics such as body side, timing, symptom quality, severity, trigger, equipment, and comparison with earlier sessions only when supported by the original or clarification.',
      'Exercise details, today metrics, and recent notes are context for resolving shorthand only. Never copy them into the cleaned note unless the raw note refers to them.',
      'Never diagnose, give advice, reinterpret pain, or invent a cause, result, improvement, symptom, date, number, or certainty.',
      'Preserve uncertainty and the user’s natural meaning. If the original is already informative, make only light edits.',
      'Ask at most one clarification only when an ambiguity could materially reverse or distort the saved meaning. Do not ask merely because optional details are absent.',
      'Fields are short optional memory tags, not a required template: experience, symptoms, context, followUp.',
      'JSON shape: {"standardizedNote":"","fields":{"experience":"","symptoms":"","context":"","followUp":""},"summary":[],"changed":true,"questions":[],"clarificationOptions":[{"label":"","value":""}]}.',
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
      dailyMetric,
    });

    let result: Awaited<ReturnType<typeof callGroqChat>>;
    try {
      result = await callGroqChat(apiKeys, 'standardize', {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPayload },
        ],
        temperature: cleanupMode ? 0.16 : 0.12,
        max_completion_tokens: 1000,
        response_format: { type: 'json_object' },
      });
    } catch (error) {
      const payload = groqErrorPayload(error);
      return NextResponse.json({
        error: 'Note standardization failed',
        detail: payload.detail,
        groqStatus: payload.groqStatus,
        groqStatusText: payload.groqStatusText,
        model: payload.model,
        attemptedModels: payload.attemptedModels,
        attempts: payload.attempts,
        originalNote: rawNote,
        standardizedNote: localFallback(rawNote),
        questions: [],
        clarificationOptions: [],
      }, { status: 502 });
    }

    const parsed = parseJson(result.data?.choices?.[0]?.message?.content ?? '{}');
    const rawStandardizedNote = cleanText(parsed.standardizedNote || rawNote, 260);
    const rawFields: StandardizedFields = parsed.fields && typeof parsed.fields === 'object' ? {
      experience: cleanText(parsed.fields.experience, 100),
      symptoms: cleanText(parsed.fields.symptoms, 120),
      context: cleanText(parsed.fields.context, 120),
      followUp: cleanText(parsed.fields.followUp, 120),
    } : {};
    const standardizedNote = rawStandardizedNote;
    const fields = rawFields;

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
      model: result.model,
      attemptedModels: result.attemptedModels,
    });
  } catch (err) {
    return NextResponse.json({
      error: 'Note standardization failed',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
