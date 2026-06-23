import { NextResponse } from 'next/server';
import { getLogForRange, getNotesForDate, getConfig, setConfig } from '@/lib/db';
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

    const [logRows, noteRows, libraryData] = await Promise.all([
      getLogForRange(yesterday, yesterday),
      getNotesForDate(yesterday),
      getConfig('exerciseLibrary'),
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

    const lines = completedIds.slice(0, 18).map(id => {
      const name = nameMap[id] || id;
      const note = noteMap[id];
      return note ? `${name}: ${note}` : name;
    });

    const userText = `Date: ${yesterday}. Exercises completed (${completedIds.length}): ${lines.join(' | ')}`;

    const { data, model } = await callGroqChat(apiKey, 'summary', {
      messages: [
        {
          role: 'system',
          content: 'Write exactly 1-2 sentences summarizing what this PT patient did yesterday. Tone: warm, grounded, direct — like a trusted coach, not a motivational poster. If they did something notable (high volume, a hike, a big effort), lead with that. Mention specific exercises or counts briefly. No clichés. No filler openers like "Yesterday you" or "Great job". Just say what happened and why it matters.',
        },
        { role: 'user', content: userText },
      ],
      temperature: 0.65,
      max_completion_tokens: 90,
    });

    const summary = (data?.choices?.[0]?.message?.content?.trim() ?? null) as string | null;

    await setConfig('dailySummaryDate', today);
    await setConfig('dailySummaryText', summary);
    return NextResponse.json({ summary, date: yesterday, cacheDate: today, timeZone: APP_TIME_ZONE, model });
  } catch {
    return NextResponse.json({ summary: null });
  }
}
