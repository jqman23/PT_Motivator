import { NextResponse } from 'next/server';
import { getLogForRange, getNotesForDate, getHealthForDate, getConfigs, setConfigs } from '@/lib/db';
import { callGroqChat, getGroqModelChain } from '@/lib/groq';
import { stripSecretNotes } from '@/lib/secretNotes';

const APP_TIME_ZONE = process.env.PT_MOTIVATOR_TIME_ZONE || 'America/Anchorage';
const DEFAULT_MODEL = getGroqModelChain('summary')[0];
const NO_ACTIVITY_SUMMARY = 'Nothing was logged yesterday, so there is no daily recap to show yet.';
const UNAVAILABLE_SUMMARY = 'Sunshine could not generate the daily recap right now. Please try again shortly.';
const SUMMARY_PROMPT_VERSION = 'analytical-v1';

function offsetDateStr(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function dateInAppTimeZone(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export async function POST() {
  const today = dateInAppTimeZone();
  const yesterday = offsetDateStr(today, -1);

  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;

    // Reuse only a real cached recap. Older code could cache a null result for the whole day,
    // which made every later tap on the sun button appear to do nothing.
    const cached = await getConfigs(['dailySummaryDate', 'dailySummaryText', 'dailySummaryVersion']);
    const cachedDate = typeof cached.dailySummaryDate === 'string' ? cached.dailySummaryDate : null;
    const cachedText = typeof cached.dailySummaryText === 'string' ? cached.dailySummaryText : null;
    const cachedVersion = typeof cached.dailySummaryVersion === 'string' ? cached.dailySummaryVersion : null;
    const usableCachedText = typeof cachedText === 'string' ? cachedText.trim() : '';
    if (cachedDate === today && cachedVersion === SUMMARY_PROMPT_VERSION && usableCachedText) {
      return NextResponse.json({
        summary: usableCachedText,
        date: yesterday,
        cacheDate: today,
        timeZone: APP_TIME_ZONE,
        model: null,
        status: 'cached',
      });
    }

    // Do not cache configuration failures as a completed daily summary. That allows the next
    // tap to retry immediately after the environment is corrected.
    if (!apiKey) {
      return NextResponse.json({
        summary: UNAVAILABLE_SUMMARY,
        date: yesterday,
        cacheDate: today,
        timeZone: APP_TIME_ZONE,
        model: DEFAULT_MODEL,
        status: 'unavailable',
        error: 'missing_api_key',
      }, { status: 503 });
    }

    const [logRows, noteRows, healthRows, sourceConfigs] = await Promise.all([
      getLogForRange(yesterday, yesterday),
      getNotesForDate(yesterday, false),
      getHealthForDate(yesterday),
      getConfigs(['exerciseLibrary', 'ptSessions']),
    ]);
    const libraryData = sourceConfigs.exerciseLibrary;
    const ptSessions = sourceConfigs.ptSessions;

    const completedIds = (logRows as Array<{ exercise_id: string; completed: boolean }>)
      .filter(r => r.completed)
      .map(r => r.exercise_id);

    // A manual tap still needs visible feedback when there is no source activity. Do not cache
    // this response because the user may add or correct yesterday's log and tap again.
    if (completedIds.length === 0) {
      return NextResponse.json({
        summary: NO_ACTIVITY_SUMMARY,
        date: yesterday,
        cacheDate: today,
        timeZone: APP_TIME_ZONE,
        model: null,
        status: 'no_activity',
      });
    }

    const library = Array.isArray(libraryData) ? (libraryData as Array<{ id: string; name: string }>) : [];
    const nameMap = Object.fromEntries(library.map(ex => [ex.id, ex.name]));
    const noteMap = Object.fromEntries(
      (noteRows as Array<{ exercise_id: string; note: string }>).map(r => [r.exercise_id, stripSecretNotes(r.note)])
    );
    const rawHealth = (healthRows as Array<Record<string, unknown>>)[0] ?? null;
    const health = rawHealth ? {
      ...rawHealth,
      sleep_notes: stripSecretNotes(String(rawHealth.sleep_notes ?? '')),
      sleep_quality_notes: stripSecretNotes(String(rawHealth.sleep_quality_notes ?? '')),
      energy_notes: stripSecretNotes(String(rawHealth.energy_notes ?? '')),
      mood_notes: stripSecretNotes(String(rawHealth.mood_notes ?? '')),
      pain_notes: stripSecretNotes(String(rawHealth.pain_notes ?? '')),
      general_notes: stripSecretNotes(String(rawHealth.general_notes ?? '')),
      treatment_notes: stripSecretNotes(String(rawHealth.treatment_notes ?? '')),
    } : null;
    const session = Array.isArray(ptSessions)
      ? (ptSessions as Array<{ date: string; kind?: string; note?: string }>).find(s => s.date === yesterday)
      : null;

    const lines = completedIds.slice(0, 18).map(id => {
      const name = nameMap[id] || id;
      const note = noteMap[id];
      return note ? `${name}: ${note}` : name;
    });

    const userText = JSON.stringify({
      date: yesterday,
      completedCount: completedIds.length,
      exercises: lines,
      health,
      session: session ? { kind: session.kind === 'training' ? 'training' : 'pt', note: stripSecretNotes(session.note) } : null,
    });

    const { data, model } = await callGroqChat(apiKey, 'summary', {
      messages: [
        {
          role: 'system',
          content: 'Write exactly 2 concise sentences about yesterday for someone actively managing a PT journey. First, summarize the most meaningful activity and symptom, health, or session detail. Second, add one cautious analytical nudge grounded only in the supplied data: connect details that may be related, identify a possible pattern worth watching, or pose a brief reflective question. Use calibrated language such as "may", "could", or "worth watching" and clearly distinguish inference from fact. Never diagnose, prescribe, imply causation, or invent a trend from one day. Tone: sharp, specific, and thoughtful—not a motivational poster. No clichés or filler openers like "Yesterday you" or "Great job".',
        },
        { role: 'user', content: userText },
      ],
      temperature: 0.65,
      max_completion_tokens: 110,
    });

    const summary = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!summary) throw new Error('Groq returned an empty daily summary');

    await setConfigs({
      dailySummaryDate: today,
      dailySummaryText: summary,
      dailySummaryVersion: SUMMARY_PROMPT_VERSION,
    });
    return NextResponse.json({
      summary,
      date: yesterday,
      cacheDate: today,
      timeZone: APP_TIME_ZONE,
      model,
      status: 'generated',
    });
  } catch (error) {
    console.error('Daily summary generation failed:', error);
    return NextResponse.json({
      summary: UNAVAILABLE_SUMMARY,
      date: yesterday,
      cacheDate: today,
      timeZone: APP_TIME_ZONE,
      model: DEFAULT_MODEL,
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'Unknown daily summary error',
    }, { status: 500 });
  }
}
