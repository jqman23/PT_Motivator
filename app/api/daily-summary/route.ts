import { NextResponse } from 'next/server';
import { getLogForRange, getNotesForDate, getHealthForDate, getConfig, setConfig } from '@/lib/db';
import { callGroqChat, getGroqModelChain } from '@/lib/groq';

const APP_TIME_ZONE = process.env.PT_MOTIVATOR_TIME_ZONE || 'America/Anchorage';
const DEFAULT_MODEL = getGroqModelChain('summary')[0];

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
  try {
    const apiKey = process.env.GROQ_KEY_PTMOTIVATOR;
    const today = dateInAppTimeZone();
    const yesterday = offsetDateStr(today, -1);

    // Return cached summary if already generated for this app-local day.
    const [cachedDate, cachedText] = await Promise.all([
      getConfig('dailySummaryDate') as Promise<string | null>,
      getConfig('dailySummaryText') as Promise<string | null>,
    ]);
    if (cachedDate === today) {
      return NextResponse.json({ summary: cachedText ?? null, date: yesterday, cacheDate: today, timeZone: APP_TIME_ZONE, model: null });
    }

    // No API key — mark as done for today, return nothing.
    if (!apiKey) {
      await setConfig('dailySummaryDate', today);
      await setConfig('dailySummaryText', null);
      return NextResponse.json({ summary: null, date: yesterday, cacheDate: today, timeZone: APP_TIME_ZONE, model: DEFAULT_MODEL });
    }

    const [logRows, noteRows, healthRows, libraryData, ptSessions] = await Promise.all([
      getLogForRange(yesterday, yesterday),
      getNotesForDate(yesterday),
      getHealthForDate(yesterday),
      getConfig('exerciseLibrary'),
      getConfig('ptSessions'),
    ]);

    const completedIds = (logRows as Array<{ exercise_id: string; completed: boolean }>)
      .filter(r => r.completed)
      .map(r => r.exercise_id);

    if (completedIds.length === 0) {
      await setConfig('dailySummaryDate', today);
      await setConfig('dailySummaryText', null);
      return NextResponse.json({ summary: null, date: yesterday, cacheDate: today, timeZone: APP_TIME_ZONE, model: DEFAULT_MODEL });
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

    const summary = (data?.choices?.[0]?.message?.content?.trim() ?? null) as string | null;

    await setConfig('dailySummaryDate', today);
    await setConfig('dailySummaryText', summary);
    return NextResponse.json({ summary, date: yesterday, cacheDate: today, timeZone: APP_TIME_ZONE, model });
  } catch {
    return NextResponse.json({ summary: null });
  }
}
