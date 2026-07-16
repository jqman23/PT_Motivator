export type AiAnswerDateSegment = {
  text: string;
  date?: string;
};

export const AI_COACH_ACTIVE_KEY = 'pt-ai-coach-active-v1';
export const AI_COACH_SESSION_KEY = 'pt-ai-coach-session-v1';
// Code-memory invariant: every saved date named in an answer must remain navigable.
// The answer itself is bounded, so this protects normal multi-day summaries without
// creating an unbounded response or an arbitrarily short five-date cutoff.
export const AI_ANSWER_DATE_LIMIT = 31;

const ISO_DATE_TEXT_PATTERN = /\b(\d{4})[-\u2010\u2011\u2012\u2013\u2014\u2212](\d{2})[-\u2010\u2011\u2012\u2013\u2014\u2212](\d{2})\b/g;

export function normalizeAiDateText(value: string) {
  return value.replace(ISO_DATE_TEXT_PATTERN, '$1-$2-$3');
}

export function aiAnswerDates(value: string) {
  return Array.from(new Set(Array.from(normalizeAiDateText(value).matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g), match => match[1])));
}

export function isIsoCalendarDate(value: string) {
  value = normalizeAiDateText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatAiDate(date: string, today: string) {
  date = normalizeAiDateText(date);
  if (!isIsoCalendarDate(date)) return date;
  const [year, month, day] = date.split('-').map(Number);
  const currentYear = isIsoCalendarDate(today) ? Number(today.slice(0, 4)) : new Date().getFullYear();
  return year === currentYear ? `${month}/${day}` : `${month}/${day}/${String(year).slice(-2)}`;
}

export function aiAnswerDateSegments(value: string): AiAnswerDateSegment[] {
  value = normalizeAiDateText(value);
  const segments: AiAnswerDateSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: value.slice(cursor, index) });
    const date = match[0];
    segments.push(isIsoCalendarDate(date) ? { text: date, date } : { text: date });
    cursor = index + date.length;
  }

  if (cursor < value.length) segments.push({ text: value.slice(cursor) });
  return segments.length ? segments : [{ text: value }];
}
