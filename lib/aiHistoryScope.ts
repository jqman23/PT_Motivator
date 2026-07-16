import type { HistoryDayRecord, RankedHistoryDay } from './historyRanking.ts';

export type BoundedHistoryWindow = {
  startDate: string;
  endDate: string;
  dayCount: number;
  sourceText: string;
};

export type NamedHistoryWindow = BoundedHistoryWindow & {
  id: string;
  label: string;
};

export type HistoryScopePlan = {
  windows: NamedHistoryWindow[];
  loadWindow: BoundedHistoryWindow;
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

const ISO_DATE_TEXT_PATTERN = /\b(\d{4})[-\u2010\u2011\u2012\u2013\u2014\u2212](\d{2})[-\u2010\u2011\u2012\u2013\u2014\u2212](\d{2})\b/g;

function answerDates(value: string) {
  const normalized = value.replace(ISO_DATE_TEXT_PATTERN, '$1-$2-$3');
  return Array.from(new Set(Array.from(normalized.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g), match => match[1])));
}

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

function weekStartDate(today: string) {
  const date = new Date(`${today}T12:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return dateString(date);
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function calendarMonthWindow(year: number, monthIndex: number, today: string, sourceText: string): BoundedHistoryWindow | null {
  const start = new Date(year, monthIndex, 1, 12);
  const end = new Date(year, monthIndex + 1, 0, 12);
  const todayDate = new Date(`${today}T12:00:00`);
  if (start > todayDate) return null;
  if (end > todayDate) end.setTime(todayDate.getTime());
  const startDate = dateString(start);
  const endDate = dateString(end);
  return { startDate, endDate, dayCount: Math.round((end.getTime() - start.getTime()) / 86400000) + 1, sourceText };
}

export function resolveBoundedHistoryWindow(value: string, today: string): BoundedHistoryWindow | null {
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (/\brecent\s+(?:notes?|history|records?|entries|logs?|symptoms?)\b/.test(text) && !/\brecent\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|few|several)?[ -]?(?:days?|weeks?|months?)\b/.test(text)) {
    return {
      startDate: shiftDate(today, -6),
      endDate: today,
      dayCount: 7,
      sourceText: 'recent saved records',
    };
  }
  const todayDate = new Date(`${today}T12:00:00`);
  if (/\b(?:this|current|present)\s+(?:calendar\s+)?month\b/.test(text)) {
    return calendarMonthWindow(todayDate.getFullYear(), todayDate.getMonth(), today, 'this month');
  }
  if (/\b(?:last|previous|prior)\s+calendar\s+month\b/.test(text)) {
    const previous = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1, 12);
    return calendarMonthWindow(previous.getFullYear(), previous.getMonth(), today, 'previous calendar month');
  }
  const namedMonth = text.match(new RegExp(`\\b(?:in|during|for|month of)\\s+(${MONTH_NAMES.join('|')})(?:\\s+(20\\d{2}))?\\b`));
  if (namedMonth) {
    const monthIndex = MONTH_NAMES.indexOf(namedMonth[1]);
    const explicitYear = namedMonth[2] ? Number(namedMonth[2]) : null;
    const inferredYear = explicitYear ?? (monthIndex > todayDate.getMonth() ? todayDate.getFullYear() - 1 : todayDate.getFullYear());
    const calendar = calendarMonthWindow(inferredYear, monthIndex, today, namedMonth[0]);
    if (calendar) return calendar;
  }
  if (/\b(?:this\s+past|past|last|previous|recent)\s+week\b/.test(text)) {
    const endDate = shiftDate(today, -1);
    return {
      startDate: shiftDate(endDate, -6),
      endDate,
      dayCount: 7,
      sourceText: 'past week',
    };
  }
  if (/\b(?:this|current|present)\s+week\b/.test(text)) {
    const startDate = weekStartDate(today);
    return {
      startDate,
      endDate: today,
      dayCount: Math.max(1, Math.ceil((new Date(`${today}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 86400000) + 1),
      sourceText: 'this week',
    };
  }
  const relative = text.match(/\b(?:past|last|previous|recent)\s+(?:(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|few|several)[ -]?)?(days?|weeks?|months?)\b/);
  if (!relative) {
    const mentionsToday = /\b(?:today|this morning|this afternoon|this evening|tonight)\b/.test(text);
    const mentionsYesterday = /\b(?:yesterday|the previous day)\b/.test(text);
    if (mentionsToday && mentionsYesterday) {
      const startDate = shiftDate(today, -1);
      return { startDate, endDate: today, dayCount: 2, sourceText: 'today and yesterday' };
    }
    if (mentionsToday) return { startDate: today, endDate: today, dayCount: 1, sourceText: 'today' };
    if (mentionsYesterday) {
      const date = shiftDate(today, -1);
      return { startDate: date, endDate: date, dayCount: 1, sourceText: 'yesterday' };
    }
    return null;
  }

  const unit = relative[2].startsWith('month') ? 30 : relative[2].startsWith('week') ? 7 : 1;
  const defaultCount = 1;
  const requestedCount = (relative[1] ? parsedCount(relative[1]) : defaultCount) * unit;
  const dayCount = Math.max(1, Math.min(365, requestedCount));
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

function comparisonDayCount(text: string, fallback: number) {
  const beforeReference = text.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')}|\\d{1,3})[ -]?(days?|weeks?)[ -](?:immediately[ -])?before[ -](?:that|this|those|it|the[ -](?:current|first|recent|last|past)[ -](?:period|range|window))\\b`));
  const priorReference = text.match(new RegExp(`\\b(?:previous|prior|preceding|earlier)[ -](?:(${Object.keys(NUMBER_WORDS).join('|')}|\\d{1,3})[ -]?)?(days?|weeks?|period|range|window)\\b`));
  const weekBefore = /\b(?:the[ -])?week[ -]before\b/.test(text);
  const match = beforeReference ?? priorReference;
  if (!match) return weekBefore ? 7 : fallback;
  if (/^week/.test(match[2] ?? '')) return Math.max(1, Math.min(90, (match[1] ? parsedCount(match[1]) : 1) * 7));
  if (/^day/.test(match[2] ?? '')) return Math.max(1, Math.min(90, match[1] ? parsedCount(match[1]) : fallback));
  return fallback;
}

/**
 * Resolve every bounded period needed by an analytical comparison, rather than
 * returning only the first date phrase. This is a typed scope stage: analytics
 * consumes named windows and the database receives their single bounded union.
 */
export function resolveHistoryScopePlan(value: string, today: string, primaryWindow?: BoundedHistoryWindow | null): HistoryScopePlan | null {
  const primary = primaryWindow ?? resolveBoundedHistoryWindow(value, today);
  if (!primary) return null;
  const text = value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  const comparisonConnector = /\b(?:compare(?:d|s|ing)?(?:\s+\w+){0,8}\s+(?:to|with|against)|versus|vs\.?|against|difference between|change from)\b/.test(text);
  const precedingReference = /\b(?:before that|before those|previous|prior|preceding|earlier|week before)\b/.test(text);
  if (!precedingReference || (!comparisonConnector && !/\bbefore (?:that|those|this|it)\b/.test(text))) {
    const only = { ...primary, id: 'primary', label: `${primary.sourceText} (${primary.startDate} through ${primary.endDate})` };
    return { windows: [only], loadWindow: primary };
  }

  const previousDays = comparisonDayCount(text, primary.dayCount);
  const previousEnd = shiftDate(primary.startDate, -1);
  const previousStart = shiftDate(previousEnd, -(previousDays - 1));
  const windows: NamedHistoryWindow[] = [
    { ...primary, id: 'primary', label: `Current period (${primary.startDate} through ${primary.endDate})` },
    { startDate: previousStart, endDate: previousEnd, dayCount: previousDays, sourceText: 'preceding comparison period', id: 'previous', label: `Previous period (${previousStart} through ${previousEnd})` },
  ];
  return {
    windows,
    loadWindow: {
      startDate: previousStart,
      endDate: primary.endDate,
      dayCount: primary.dayCount + previousDays,
      sourceText: `${primary.sourceText} and preceding comparison period`,
    },
  };
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

export function buildWholeHistoryComparison(records: HistoryDayRecord[]) {
  return {
    coversEveryLoadedDay: true,
    dayCount: records.length,
    dateRange: records.length ? { start: records[0].date, end: records[records.length - 1].date } : null,
    columns: ['date', 'sessionKind', 'activityCount', 'exerciseNoteCount', 'pain', 'energy', 'mood', 'sleepHours', 'sleepQuality', 'notableContext'],
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
  const cited = answerDates(answer);
  return new Set([...cited, ...explicitDates]);
}

export function strongFallbackDays<T extends HistoryDayRecord>(days: RankedHistoryDay<T>[], explicitDates: string[]) {
  const explicit = new Set(explicitDates);
  return days.filter(day => explicit.has(day.date) || day.evidence.some(item => (
    /^(?:Explicitly referenced|Currently selected|Day (?:after|before)|Exact phrase)|\b(?:was \d|session recorded on this day)\b/i.test(item)
  )));
}
