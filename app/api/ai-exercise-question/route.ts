import { NextRequest, NextResponse } from 'next/server';
import { callGroqChat, getGroqModelChain, groqErrorPayload } from '@/lib/groq';
import { getConfig, getHealthForDate, getLogForDate, getNotesForDate } from '@/lib/db';

const DEFAULT_MODEL = getGroqModelChain('ask')[0];

function cleanText(value: unknown, limit = 1200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function jsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object returned');
  return JSON.parse(match[0]);
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function shiftDate(base: string, days: number) {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function weekdayIndex(name: string) {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(name.toLowerCase());
}

function resolveWeekday(name: string, anchor: string, preferPast = true) {
  const target = weekdayIndex(name);
  if (target < 0) return null;
  const anchorDate = new Date(anchor + 'T12:00:00');
  const current = anchorDate.getDay();
  let diff = target - current;
  if (preferPast && diff > 0) diff -= 7;
  if (!preferPast && diff < 0) diff += 7;
  anchorDate.setDate(anchorDate.getDate() + diff);
  return toDateStr(anchorDate);
}

function extractDates(text: string, today: string, selectedDate?: string | null) {
  const out = new Set<string>();
  const add = (value?: string | null) => { const d = validDate(value ?? undefined); if (d) out.add(d); };
  for (const match of text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) add(match[1]);
  for (const match of text.matchAll(/\b(0?\d{1,2})[/-](0?\d{1,2})(?:[/-](\d{2,4}))?\b/g)) {
    const m = Number(match[1]);
    const d = Number(match[2]);
    const yRaw = match[3];
    const y = yRaw ? Number(yRaw.length === 2 ? `20${yRaw}` : yRaw) : Number(today.slice(0, 4));
    const parsed = `${y}-${pad(m)}-${pad(d)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) out.add(parsed);
  }

  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) out.add(today);
  if (/\bday before yesterday\b/.test(lower)) out.add(shiftDate(today, -2));
  if (!/\bday before yesterday\b/.test(lower) && /\byesterday\b/.test(lower)) out.add(shiftDate(today, -1));
  if (/\btwo days ago\b/.test(lower)) out.add(shiftDate(today, -2));
  if (/\blast week\b/.test(lower)) out.add(shiftDate(today, -7));
  for (const day of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']) {
    if (lower.includes(day)) {
      const resolved = resolveWeekday(day, today, !/\bnext\s+/.test(lower));
      if (resolved) out.add(resolved);
    }
  }

  if (!out.size && selectedDate && /that day|that session|what did i do|how was my day|did i do|on that day/i.test(text)) {
    add(selectedDate);
  }

  return Array.from(out).slice(0, 4);
}

async function loadDayContext(date: string) {
  const [logRows, noteRows, healthRows, ptSessions] = await Promise.all([
    getLogForDate(date),
    getNotesForDate(date),
    getHealthForDate(date),
    getConfig('ptSessions'),
  ]);

  const ptSession = Array.isArray(ptSessions)
    ? (ptSessions as Array<{ date: string; kind?: string; note?: string }>).find(s => s.date === date)
    : null;

  return {
    date,
    exercises: (logRows as Array<{ exercise_id: string; completed: boolean }>).filter(r => r.completed).map(r => r.exercise_id).slice(0, 20),
    notes: (noteRows as Array<{ exercise_id: string; note: string }>).filter(r => r.note.trim()).slice(0, 12),
    health: (healthRows as Array<Record<string, unknown>>)[0] ?? null,
    session: ptSession ? { kind: ptSession.kind === 'training' ? 'training' : 'pt', note: ptSession.note ?? '' } : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    if (!apiKey) return NextResponse.json({ error: 'Missing GROQ_KEY_PTMOTIVATOR' }, { status: 500 });

    const { question, history, exercises, clarificationCount, sourceMatches, selectedDate, today: clientToday } = await req.json();
    const cleanQuestion = cleanText(question, 1200);
    if (!cleanQuestion) return NextResponse.json({ error: 'Question required' }, { status: 400 });
    const appToday = validDate(clientToday) ?? toDateStr(new Date());
    const requestedDates = extractDates(`${cleanQuestion} ${(Array.isArray(history) ? JSON.stringify(history) : '')}`, appToday, validDate(selectedDate));
    const dayContext = await Promise.all(requestedDates.map(date => loadDayContext(date)));

    const system = [
      'Help the user identify a remembered movement and turn it into an editable app draft.',
      'Use the app list and database matches as context, not as strict limits.',
      'Respect the user-described setup and movement details. Do not overwrite them with generic form advice.',
      'When unclear, ask one short clarifying question and return 2-3 short option labels.',
      'If day context is provided, use it to answer questions about specific days, sessions, patterns, or what happened on a named date.',
      'Keep answers sharp and specific. Do not be bland. Mention the useful detail that actually changes the read, not generic praise.',
      'Return compact JSON only: {"answer":"","options":[],"confirmedExercise":{"name":"","cue":"","sets":"","type":"mobility","imageSearch":"","confidence":"","nextStep":"","tips":[]}}. Omit confirmedExercise if not confident.'
    ].join(' ');

    const { data, model, attemptedModels } = await callGroqChat(apiKey, 'ask', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ question: cleanQuestion, history, exercises, clarificationCount, sourceMatches, selectedDate: validDate(selectedDate), today: appToday, dayContext }) },
      ],
      temperature: 0.26,
      max_completion_tokens: 820,
      response_format: { type: 'json_object' },
    });

    const raw = jsonFromText(data?.choices?.[0]?.message?.content ?? '{}');
    const confirmed = raw.confirmedExercise && typeof raw.confirmedExercise === 'object' ? raw.confirmedExercise : undefined;

    return NextResponse.json({
      reply: {
        answer: cleanText(raw.answer, 520) || 'I can help narrow it down. Which version sounds closest?',
        options: Array.isArray(raw.options) ? raw.options.map((option: unknown) => cleanText(option, 110)).filter(Boolean).slice(0, 3) : [],
        confirmedExercise: confirmed ? {
          name: cleanText(confirmed.name, 120),
          cue: cleanText(confirmed.cue, 520),
          sets: cleanText(confirmed.sets, 180),
          cat: cleanText(confirmed.type ?? confirmed.cat, 40).toLowerCase().replace(/[^a-z0-9 /&-]+/g, '').trim() || 'mobility',
          imageSearch: cleanText(confirmed.imageSearch, 180),
          confidence: cleanText(confirmed.confidence, 80),
          nextStep: cleanText(confirmed.nextStep, 220),
          tips: Array.isArray(confirmed.tips) ? confirmed.tips.map((tip: unknown) => cleanText(tip, 140)).filter(Boolean).slice(0, 3) : [],
        } : undefined,
      },
      model,
      attemptedModels,
    });
  } catch (err) {
    console.error('[ai-exercise-question]', err);
    const payload = groqErrorPayload(err);
    return NextResponse.json({ ...payload, model: payload.model ?? DEFAULT_MODEL }, { status: payload.error === 'Groq request failed' ? 502 : 500 });
  }
}
