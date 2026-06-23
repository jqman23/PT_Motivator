import { NextRequest, NextResponse } from 'next/server';
import { callGroqChat, getGroqModelChain, groqErrorPayload } from '@/lib/groq';

const DEFAULT_MODEL = getGroqModelChain('ask')[0];

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type SourceMatch = {
  source?: string;
  sourceId?: string;
  name?: string;
  sets?: string;
  cue?: string;
  tips?: string[];
  gifUrl?: string;
  label?: string;
};

function cleanText(value: unknown, limit = 1200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function optionText(value: unknown) {
  return cleanText(value, 110).replace(/[?？]+$/g, '').trim();
}

function cleanOptions(value: unknown) {
  return Array.isArray(value) ? value.map(optionText).filter(Boolean).slice(0, 3) : [];
}

function cleanSourceMatches(value: unknown): SourceMatch[] {
  return Array.isArray(value)
    ? value.slice(0, 8).map((match: SourceMatch) => ({
        source: cleanText(match?.source, 24),
        sourceId: cleanText(match?.sourceId, 90),
        name: cleanText(match?.name, 120),
        sets: cleanText(match?.sets, 120),
        cue: cleanText(match?.cue, 260),
        tips: Array.isArray(match?.tips) ? match.tips.map(tip => cleanText(tip, 140)).filter(Boolean).slice(0, 5) : [],
        gifUrl: cleanText(match?.gifUrl, 220),
        label: cleanText(match?.label, 40),
      })).filter(match => match.name)
    : [];
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
    answer: cleanText(raw.answer, 520) || 'I can help narrow it down. Which version sounds closest?',
    options: allowOptions ? cleanOptions(raw.options) : [],
    confirmedExercise: confirmed ? {
      name: cleanText(confirmed.name, 120),
      cue: cleanText(confirmed.cue, 520),
      sets: cleanText(confirmed.sets, 180),
      cat: cleanText(confirmed.cat, 20) === 'strength' ? 'strength' : 'mobility',
      imageSearch: cleanText(confirmed.imageSearch, 180),
      confidence: cleanText(confirmed.confidence, 80),
      nextStep: cleanText(confirmed.nextStep, 220),
      tips: cleanOptions(confirmed.tips),
    } : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) return NextResponse.json({ error: 'Missing GROQ_KEY_PTMOTIVATOR' }, { status: 500 });

    const { question, history, exercises, clarificationCount, sourceMatches } = await req.json();
    const cleanQuestion = cleanText(question, 1200);
    if (!cleanQuestion) return NextResponse.json({ error: 'Question required' }, { status: 400 });

    const cleanHistory: ChatMessage[] = Array.isArray(history)
      ? history.slice(-6).map((msg: ChatMessage): ChatMessage => ({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: cleanText(msg.content, 420) })).filter((msg: ChatMessage) => msg.content)
      : [];

    const exerciseContext = Array.isArray(exercises) ? exercises.slice(0, 80) : [];
    const cleanSourceMatches = cleanSourceMatches(sourceMatches);
    const cleanClarificationCount = Math.max(0, Math.min(2, Number(clarificationCount) || 0));

    const system = [
      'You are a world-class physical therapist and exercise coach helping identify exactly which exercise, drill, stretch, nerve glide, mobility move, or strength variation the user is trying to remember.',
      'Think outside the app library first. Use broad PT, rehab, sports medicine, orthopedic, and exercise-coaching knowledge. The app exerciseLibrary is optional context only, not the boundary of what you can consider.',
      'The user is often describing a movement from memory with messy language. Reconstruct likely setup, body position, moving joints, target tissue/nerve/muscle, and intent before answering.',
      'Be especially strong at lower-body rehab: ankle/foot, toes, plantar fascia, calf/Achilles, peroneals, tibialis, sciatic/tibial/sural/peroneal nerve glides, slump variations, hip/knee mechanics, balance, and gait-related drills.',
      'You may receive sourceMatches from ExerciseDB and API Ninjas. Treat those as database search evidence. Use them when relevant, but do not blindly choose a database result if the user description points elsewhere.',
      'When a sourceMatch is relevant, use its canonical name, source label, cue/instructions, and tips to make the draft more accurate. If a sourceMatch is close but not exact, say the likely family of movement and ask one clarifying question.',
      'When multiple common exercises are plausible, do not force a single answer. Ask one concise clarifying question and provide 2-3 selectable options as short answer choices, not questions; no question marks in options.',
      'Options should be meaningfully different hypotheses, not tiny wording variants. Example option labels: "Seated slump nerve glide", "Long-sitting sciatic nerve glide", "Ankle pump / calf floss".',
      'If the likely exercise is not already in exerciseLibrary or sourceMatches, still name it and create an app-ready confirmedExercise from general PT knowledge. Do not say it is unavailable just because it is not in the app.',
      'If exerciseLibrary contains a close match, mention or use that match. If no match exists, reason from outside knowledge and make a new clean draft.',
      'Be concise but useful: one clear sentence for uncertain answers; a compact draft when confident.',
      'Do not diagnose, prescribe, or replace clinician advice. Avoid medical alarm language unless the user mentions red flags. Phrase as exercise identification, not medical treatment.',
      'After 2 clarification rounds, stop asking and give the best likely confirmedExercise or a brief answer with options: [].',
      'When confident, include confirmedExercise with app-ready name, cue, sets, category, imageSearch, and 2-3 practical tips. Then use options: [].',
      'For confirmedExercise.name, prefer canonical PT names with position + target/pattern, e.g. "Seated slump nerve glide", "Long-sitting sciatic nerve glide", "Standing calf stretch".',
      'For confirmedExercise.cue, give clear setup and movement sequence in normal app language. Include what moves and what stays relaxed. Do not quote the user\'s messy wording.',
      'For confirmedExercise.sets, if dosage is missing, use a cautious placeholder like "2 x 10 gentle reps" for nerve glides/mobility rather than inventing intense dosage. Keep it editable.',
      'Return compact JSON only: {"answer":"","options":[],"confirmedExercise":{"name":"","cue":"","sets":"","cat":"mobility","imageSearch":"","confidence":"","nextStep":"","tips":[]}}. Omit confirmedExercise if not confident.',
    ].join(' ');

    const { data, model, attemptedModels } = await callGroqChat(apiKey, 'ask', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ currentQuestion: cleanQuestion, clarificationRound: cleanClarificationCount, maxClarificationRounds: 2, history: cleanHistory, exerciseLibrary: exerciseContext, sourceMatches: cleanSourceMatches, libraryIsOnlyOptionalContext: true }) },
      ],
      temperature: 0.32,
      max_completion_tokens: 920,
      response_format: { type: 'json_object' },
    });

    const content = data?.choices?.[0]?.message?.content ?? '{}';
    return NextResponse.json({ reply: normalizeReply(jsonFromText(content), cleanClarificationCount < 2), model, attemptedModels });
  } catch (err) {
    console.error('[ai-exercise-question]', err);
    const payload = groqErrorPayload(err);
    return NextResponse.json({ ...payload, model: payload.model ?? DEFAULT_MODEL }, { status: payload.error === 'Groq request failed' ? 502 : 500 });
  }
}
