import type { HistoryDayRecord, RankedHistoryDay } from './historyRanking.ts';

export type BoundedHistoryWindow = {
  startDate: string;
  endDate: string;
  dayCount: number;
  sourceText: string;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
  few: 3,
  several: 5,
};

function dateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateString(date);
}

function parsedCount(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NUMBER_WORDS[value.toLowerCase()] ?? 0;
}

export function resolveBoundedHistoryWindow(value: string, today: string): BoundedHistoryWindow | null {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  const relative = text.match(/\b(?:past|last|previous|recent)\s+(?:(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|few|several)[ -]?)?(days?|weeks?)\b/);
  if (!relative) {
    if (/\b(?:yesterday|the previous day)\b/.test(text)) {
      const date = shiftDate(today, -1);
      return { startDate: date, endDate: date, dayCount: 1, sourceText: 'yesterday' };
    }
    return null;
  }

  const unit = relative[2].startsWith('week') ? 7 : 1;
  const defaultCount = unit === 7 ? 1 : 1;
  const requestedCount = (relative[1] ? parsedCount(relative[1]) : defaultCount) * unit;
  const dayCount = Math.max(1, Math.min(90, requestedCount));
  const includesToday = /\b(?:including|through|thru|up to) today\b|\btoday and (?:the )?(?:past|previous|last)\b/.test(text);
  const endDate = includesToday ? today : shiftDate(today, -1);
  return {
    startDate: shiftDate(endDate, -(dayCount - 1)),
    endDate,
    dayCount,
    sourceText: relative[0],
  };
}

export function resolveHistoryWindowFromConversation(current: string, priorUserMessages: string[], today: string) {
  const currentWindow = resolveBoundedHistoryWindow(current, today);
  if (currentWindow) return currentWindow;
  for (const message of [...priorUserMessages].reverse()) {
    const window = resolveBoundedHistoryWindow(message, today);
    if (window) return window;
  }
  return null;
}

export function calendarDays(window: BoundedHistoryWindow) {
  return Array.from({ length: window.dayCount }, (_, index) => shiftDate(window.startDate, index));
}

export function recordsForWindow<T extends HistoryDayRecord>(records: T[], window: BoundedHistoryWindow): HistoryDayRecord[] {
  const byDate = new Map(records.map(record => [record.date, record]));
  return calendarDays(window).map(date => byDate.get(date) ?? {
    date,
    completed: [],
    exerciseNotes: [],
    health: null,
    session: null,
    aiInstructions: [],
    workoutEntries: [],
    exerciseMetrics: [],
    workoutTracked: false,
    workoutEntryCount: 0,
  });
}

export function recordsForVisualization<T extends HistoryDayRecord>(
  records: T[],
  window: BoundedHistoryWindow | null,
  includeWholeHistory: boolean,
  recentLimit = 14,
): HistoryDayRecord[] {
  if (window) return recordsForWindow(records, window);
  if (includeWholeHistory) return records;
  return records.slice(-Math.max(1, recentLimit));
}

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

function noteCorpus(record: HistoryDayRecord) {
  const health = record.health ?? {};
  return compact([
    health.treatmentNote,
    health.sleepNote,
    health.energyNote,
    health.moodNote,
    record.session?.note,
    ...record.exerciseNotes.map(note => `${note.exercise}: ${note.note}`),
  ].filter(Boolean).join(' | '), 700);
}

export function buildWholeHistoryComparison(records: HistoryDayRecord[]) {
  return {
    coversEveryLoadedDay: true,
    dayCount: records.length,
    dateRange: records.length ? { start: records[0].date, end: records[records.length - 1].date } : null,
    columns: ['date', 'sessionKind', 'activityCount', 'exerciseNoteCount', 'pain', 'energy', 'mood', 'sleepHours', 'sleepQuality', 'notableContext', 'painNote', 'generalNote', 'otherNoteCorpus'],
    rows: records.map(record => {
      const health = record.health ?? {};
      return [
        record.date,
        record.session?.kind ?? null,
        new Set([...record.completed, ...(record.exerciseMetrics ?? []).map(metric => metric.exercise)]).size,
        record.exerciseNotes.length,
        numeric(health.pain),
        numeric(health.energy),
        numeric(health.mood),
        numeric(health.sleepHours),
        numeric(health.sleepQuality),
        notableContext(record) || null,
        compact(health.painNote, 1200) || null,
        compact(health.generalNote, 1800) || null,
        noteCorpus(record) || null,
      ];
    }),
  };
}

export function buildBoundedHistoryComparison(records: HistoryDayRecord[], window: BoundedHistoryWindow) {
  const scoped = recordsForWindow(records, window);
  return {
    coversEveryCalendarDay: true,
    dayCount: window.dayCount,
    dateRange: { start: window.startDate, end: window.endDate },
    columns: ['date', 'completedExercises', 'metricExercises', 'pain', 'energy', 'mood', 'sleepHours', 'sleepQuality', 'hasSavedData'],
    rows: scoped.map(record => {
      const health = record.health ?? {};
      const metricExercises = Array.from(new Set((record.exerciseMetrics ?? []).map(metric => metric.exercise)));
      const hasSavedData = Boolean(
        record.completed.length
        || record.exerciseNotes.length
        || record.health
        || record.session
        || record.workoutEntries?.length
        || record.exerciseMetrics?.length
        || record.workoutTracked,
      );
      return [
        record.date,
        record.completed,
        metricExercises,
        numeric(health.pain),
        numeric(health.energy),
        numeric(health.mood),
        numeric(health.sleepHours),
        numeric(health.sleepQuality),
        hasSavedData,
      ];
    }),
  };
}

export function buildExerciseCompletionCoverage(records: HistoryDayRecord[], trackedExercises: Array<{ id: string; name: string }>) {
  const trackedIds = new Set(trackedExercises.map(exercise => exercise.id));
  const activityIds = new Set<string>();
  const removedActivityNames = new Set<string>();
  for (const record of records) {
    for (const entry of record.workoutEntries ?? []) {
      if (!entry.completed) continue;
      activityIds.add(entry.exerciseId);
      if (!trackedIds.has(entry.exerciseId)) removedActivityNames.add(entry.exercise);
    }
    for (const metric of record.exerciseMetrics ?? []) {
      activityIds.add(metric.exerciseId);
      if (!trackedIds.has(metric.exerciseId)) removedActivityNames.add(metric.exercise);
    }
  }
  return {
    performedNames: [
      ...trackedExercises.filter(exercise => activityIds.has(exercise.id)).map(exercise => exercise.name),
      ...removedActivityNames,
    ].sort((a, b) => a.localeCompare(b)),
    missedNames: trackedExercises
      .filter(exercise => !activityIds.has(exercise.id))
      .map(exercise => exercise.name)
      .sort((a, b) => a.localeCompare(b)),
    trackerExerciseCount: trackedExercises.length,
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
