import { NextResponse } from 'next/server';
import { getLogForRange, getNotesForDate, getHealthForDate, getConfig, setConfig } from '@/lib/db';
import { callGroqChat, getGroqModelChain } from '@/lib/groq';

const APP_TIME_ZONE = process.env.PT_MOTIVATOR_TIME_ZONE || 'America/Anchorage';
const DEFAULT_MODEL = getGroqModelChain('summary')[0];
const NO_ACTIVITY_SUMMARY = 'Nothing was logged yesterday, so there is no daily recap to show yet.';
const UNAVAILABLE_SUMMARY = 'Sunshine could not generate the daily recap right now. Please try again shortly.';

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
    const [cachedDate, cachedText] = await Promise.all([
      getConfig('dailySummaryDate') as Promise<string | null>,
      getConfig('dailySummaryText') as Promise<string | null>,
    ]);
    const usableCachedText = typeof cachedText === 'string' ? cachedText.trim() : '';
    if (cachedDate === today && usableCachedText) {
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

    const [logRows, noteRows, healthRows, libraryData, ptSessions] = await Promise.all([
      getLogForRange(yesterday, yesterday),
      getNotesForDate(yesterday, false),
      getHealthForDate(yesterday),
      getConfig('exerciseLibrary'),
      getConfig('ptSessions'),
    ]);

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
      (noteRows as Array<{ exercise_id: string; note: string }>).map(r => [r.exercise_id, r.note])
    );
    const health = (healthRows as Array<Record<string, unknown>>)[0] ?? null;
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
      session: session ? { kind: session.kind === 'training' ? 'training' : 'pt', note: session.note ?? '' } : null,
    });

    const { data, model } = await callGroqChat(apiKey, 'summary', {
      messages: [
        {
          role: 'system',
          content: 'Write exactly 1-2 sentences summarizing what happened yesterday. Tone: sharp, grounded, and specific — like a PT note written by someone who understands the pattern, not a motivational poster. Call out the meaningful detail: what was done, what stands out, and any signal from the session/health notes. If there was a PT or training session, mention it only if it changes the read. No clichés. No filler openers like "Yesterday you" or "Great job".',
        },
        { role: 'user', content: userText },
      ],
      temperature: 0.65,
      max_completion_tokens: 110,
    });

    const summary = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!summary) throw new Error('Groq returned an empty daily summary');

    await Promise.all([
      setConfig('dailySummaryDate', today),
      setConfig('dailySummaryText', summary),
    ]);
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
