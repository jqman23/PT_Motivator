import type { HistoryDayRecord, RankedHistoryDay } from './historyRanking.ts';

function numeric(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compact(value: unknown, limit: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function notableContext(record: HistoryDayRecord) {
  const health = record.health ?? {};
  return compact(
    health.generalNote
      || health.painNote
      || record.session?.note
      || record.exerciseNotes[0]?.note,
    120,
  );
}

export function buildWholeHistoryComparison(records: HistoryDayRecord[]) {
  return {
    coversEveryLoadedDay: true,
    dayCount: records.length,
    dateRange: records.length ? { start: records[0].date, end: records[records.length - 1].date } : null,
    columns: ['date', 'sessionKind', 'completedCount', 'exerciseNoteCount', 'pain', 'energy', 'mood', 'sleepHours', 'sleepQuality', 'notableContext'],
    rows: records.map(record => {
      const health = record.health ?? {};
      return [
        record.date,
        record.session?.kind ?? null,
        record.completed.length,
        record.exerciseNotes.length,
        numeric(health.pain),
        numeric(health.energy),
        numeric(health.mood),
        numeric(health.sleepHours),
        numeric(health.sleepQuality),
        notableContext(record) || null,
      ];
    }),
  };
}

export function supportedDateLinkDates(answer: string, explicitDates: string[]) {
  const cited = Array.from(answer.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g), match => match[1]);
  return new Set([...cited, ...explicitDates]);
}

export function strongFallbackDays<T extends HistoryDayRecord>(days: RankedHistoryDay<T>[], explicitDates: string[]) {
  const explicit = new Set(explicitDates);
  return days.filter(day => explicit.has(day.date) || day.evidence.some(item => (
    /^(?:Explicitly referenced|Currently selected|Day (?:after|before)|Exact phrase)|\b(?:was \d|session recorded on this day)\b/i.test(item)
  )));
}
