import type { AiVisualization } from './aiVisualizations';
import type { NamedHistoryWindow } from './aiHistoryScope';
import type { HistoryDayRecord } from './historyRanking';

export type AiAnalyticsField = 'pain' | 'energy' | 'mood' | 'sleepHours' | 'sleepQuality' | 'activityCount' | 'ptSession' | 'trainingSession';
export type AiAnalyticsAggregation = 'average' | 'sum' | 'minimum' | 'maximum' | 'median' | 'count' | 'percentage' | 'longestStreak';
export type AiAnalyticsGroup = 'day' | 'week' | 'month' | 'overall' | 'activityState' | 'sessionKind' | 'scope';
export type AiAnalyticsMissingPolicy = 'exclude' | 'zero' | 'labelMissing';

export type AiAnalyticsMeasure = {
  field: AiAnalyticsField;
  aggregation: AiAnalyticsAggregation;
  label: string;
};

export type AiAnalyticsPlan = {
  version: 1;
  title: string;
  analysis: 'aggregate' | 'correlation';
  measures: AiAnalyticsMeasure[];
  groupBy: AiAnalyticsGroup;
  visual: 'table' | 'line' | 'bar';
  missingData: AiAnalyticsMissingPolicy;
  requestedCoverage?: { observedCount: boolean; missingCount: boolean };
  /** Server-resolved named periods. Model output cannot directly authorize these ranges. */
  scopes?: NamedHistoryWindow[];
};

export type AiAnalyticsResult = {
  plan: AiAnalyticsPlan;
  visualization: AiVisualization;
  coverage: {
    startDate?: string;
    endDate?: string;
    analyzedDays: number;
    observedValues: number;
    missingValues: number;
    missingData: AiAnalyticsMissingPolicy;
    measures: Array<{ field: AiAnalyticsField; observedValues: number; missingValues: number }>;
  };
  evidenceLedger: {
    operation: 'structured-analytics';
    scope: { startDate?: string; endDate?: string; analyzedDays: number };
    sourceRecordIds: string[];
    filters: string[];
    grouping: AiAnalyticsGroup;
    calculations: Array<{ field: AiAnalyticsField; aggregation: AiAnalyticsAggregation; formula: string }>;
    missingDataPolicy: AiAnalyticsMissingPolicy;
    assumptions: string[];
  };
};

const FIELD_LABELS: Record<AiAnalyticsField, string> = {
  pain: 'Pain', energy: 'Energy', mood: 'Mood', sleepHours: 'Sleep duration', sleepQuality: 'Sleep quality',
  activityCount: 'Recorded exercises', ptSession: 'PT session', trainingSession: 'Training session',
};

const FIELD_UNITS: Partial<Record<AiAnalyticsField, string>> = {
  pain: '/10', energy: '/10', mood: '/10', sleepHours: 'hours', sleepQuality: '/10', activityCount: 'exercises',
};

function text(value: unknown, limit: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueActivityCount(record: HistoryDayRecord) {
  return new Set([
    ...record.completed,
    ...(record.exerciseMetrics ?? []).map(metric => metric.exercise),
  ]).size;
}

function fieldValue(record: HistoryDayRecord, field: AiAnalyticsField) {
  if (field === 'activityCount') return uniqueActivityCount(record);
  if (field === 'ptSession') return record.session?.kind === 'pt' ? 1 : 0;
  if (field === 'trainingSession') return record.session?.kind === 'training' ? 1 : 0;
  return numeric(record.health?.[field]);
}

function normalizeField(value: unknown): AiAnalyticsField | null {
  const compact = text(value, 40).replace(/[_ -]/g, '').toLowerCase();
  const fields: Record<string, AiAnalyticsField> = {
    pain: 'pain', energy: 'energy', mood: 'mood', sleephours: 'sleepHours', sleepduration: 'sleepHours',
    sleepquality: 'sleepQuality', activitycount: 'activityCount', exercisecount: 'activityCount',
    exercises: 'activityCount', ptsession: 'ptSession', trainingsession: 'trainingSession',
  };
  return fields[compact] ?? null;
}

function normalizeAggregation(value: unknown): AiAnalyticsAggregation | null {
  const compact = text(value, 40).replace(/[_ -]/g, '').toLowerCase();
  const values: Record<string, AiAnalyticsAggregation> = {
    avg: 'average', mean: 'average', average: 'average', sum: 'sum', total: 'sum', min: 'minimum', minimum: 'minimum',
    max: 'maximum', maximum: 'maximum', median: 'median', count: 'count', percentage: 'percentage', percent: 'percentage',
    rate: 'percentage', streak: 'longestStreak', longeststreak: 'longestStreak',
  };
  return values[compact] ?? null;
}

function normalizeGroup(value: unknown): AiAnalyticsGroup | null {
  const compact = text(value, 40).replace(/[_ -]/g, '').toLowerCase();
  const values: Record<string, AiAnalyticsGroup> = {
    day: 'day', daily: 'day', week: 'week', weekly: 'week', month: 'month', monthly: 'month', overall: 'overall',
    activitystate: 'activityState', workoutvsrest: 'activityState', sessionkind: 'sessionKind', sessiontype: 'sessionKind',
  };
  return values[compact] ?? null;
}

export function normalizeAiAnalyticsPlan(value: unknown): AiAnalyticsPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const raw = root.analyticsPlan && typeof root.analyticsPlan === 'object' && !Array.isArray(root.analyticsPlan)
    ? root.analyticsPlan as Record<string, unknown>
    : root;
  if (!Array.isArray(raw.measures)) return null;
  const measures = raw.measures.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const field = normalizeField(row.field ?? row.measure);
    const aggregation = normalizeAggregation(row.aggregation ?? row.operation);
    if (!field || !aggregation) return [];
    return [{ field, aggregation, label: text(row.label, 80) || `${FIELD_LABELS[field]} ${aggregation}` }];
  }).slice(0, 4);
  const groupBy = normalizeGroup(raw.groupBy ?? raw.dimension);
  const visual = raw.visual === 'table' || raw.visual === 'bar' || raw.visual === 'line' ? raw.visual : null;
  const analysis = raw.analysis === 'correlation' ? 'correlation' : 'aggregate';
  const missingData = raw.missingData === 'zero' || raw.missingData === 'labelMissing' || raw.missingData === 'exclude'
    ? raw.missingData : null;
  if (!measures.length || !groupBy || !visual || !missingData) return null;
  if (groupBy === 'overall' && visual === 'line') return null;
  if (measures.some(measure => measure.aggregation === 'longestStreak') && groupBy !== 'overall') return null;
  if (analysis === 'correlation' && (measures.length !== 2 || groupBy !== 'overall' || visual !== 'table')) return null;
  if (measures.some(measure => measure.aggregation === 'percentage' && measure.field !== 'ptSession' && measure.field !== 'trainingSession')) return null;
  return { version: 1, title: text(raw.title, 120) || 'Saved data analysis', analysis, measures, groupBy, visual, missingData };
}

export function aiAnalyticsNeedsDerivedEvents(question: string) {
  const source = question.toLowerCase().replace(/[’]/g, "'");
  const asksLateralityOrAnatomy = /\b(?:left|right|bilateral|both sides?|laterality|side-to-side|heel|ankle|foot|feet|toe|toes|arch|achilles|calf|metatarsal|leg|knee|hip|shoulder|elbow|wrist|hand|lower back|upper back|back pain|neck pain)\b/.test(source);
  const asksEventSemantics = /\b(?:trigger|flare(?:-?up)?|resolved|no longer|duration|how long|before and after|pre[- ]?post|treatment response|most associated|which exercise|specific exercise|by exercise|per exercise|adherence|completion rate|skipped exercises?)\b/.test(source);
  return asksLateralityOrAnatomy || asksEventSemantics;
}

function requestedAggregation(value: string): AiAnalyticsAggregation {
  return /\b(?:longest|best)\b.{0,40}\bstreak\b/.test(value) ? 'longestStreak'
    : /\b(?:percent|percentage|rate|proportion)\b/.test(value) ? 'percentage'
      : /\bmedian\b/.test(value) ? 'median'
        : /\b(?:minimum|lowest|min)\b/.test(value) ? 'minimum'
          : /\b(?:maximum|highest|max)\b/.test(value) ? 'maximum'
            : /\b(?:sum|total)\b/.test(value) ? 'sum'
              : /\b(?:avg|average|mean)\b/.test(value) ? 'average'
                : /\b(?:count|how many|number of)\b/.test(value) ? 'count'
                  : 'average';
}

function fieldClause(source: string, field: AiAnalyticsField) {
  const terms: Record<AiAnalyticsField, RegExp> = {
    pain: /\bpain\b/, energy: /\benergy\b/, mood: /\bmood\b/,
    sleepHours: /\b(?:sleep hours?|hours? (?:of )?sleep|sleep duration|slept|sleep)\b/,
    sleepQuality: /\bsleep quality\b/, activityCount: /\b(?:exercise|exercises|workout|workouts|activity|activities)\b/,
    ptSession: /\b(?:pt sessions?|physical therapy sessions?)\b/, trainingSession: /\btraining sessions?\b/,
  };
  const match = terms[field].exec(source);
  if (!match || match.index === undefined) return source;
  const before = source.slice(0, match.index);
  const after = source.slice(match.index + match[0].length);
  const beforeBoundary = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf(' and '));
  const afterBoundaries = [after.indexOf(','), after.indexOf(';'), after.indexOf(' and ')].filter(index => index >= 0);
  const afterBoundary = afterBoundaries.length ? Math.min(...afterBoundaries) : after.length;
  return source.slice(beforeBoundary + 1, match.index + match[0].length + afterBoundary);
}

export function inferAiAnalyticsPlan(question: string, scopes: NamedHistoryWindow[] = []): AiAnalyticsPlan | null {
  const source = question.toLowerCase().replace(/[’]/g, "'");
  if (aiAnalyticsNeedsDerivedEvents(source)) return null;
  const fields: AiAnalyticsField[] = [];
  if (/\bpain\b/.test(source)) fields.push('pain');
  if (/\benergy\b/.test(source)) fields.push('energy');
  if (/\bmood\b/.test(source)) fields.push('mood');
  if (/\b(?:sleep hours?|hours? (?:of )?sleep|sleep duration|slept|sleep)\b/.test(source) && !/\bsleep quality\b/.test(source)) fields.push('sleepHours');
  if (/\bsleep quality\b/.test(source)) fields.push('sleepQuality');
  if (/\b(?:exercise|exercises|workout|workouts|activity|activities|adherence)\b/.test(source)) fields.push('activityCount');
  if (/\bpt sessions?|physical therapy sessions?\b/.test(source)) fields.push('ptSession');
  if (/\btraining sessions?\b/.test(source)) fields.push('trainingSession');
  if (!fields.length) return null;

  const analysis: AiAnalyticsPlan['analysis'] = /\b(?:correlat(?:e|ed|es|ion)|relationship|associated with)\b/.test(source) ? 'correlation' : 'aggregate';
  const defaultAggregation = requestedAggregation(source);
  const measures = Array.from(new Set(fields)).slice(0, analysis === 'correlation' ? 2 : 4).map(field => {
    const clause = fieldClause(source, field);
    let aggregation = analysis === 'correlation' ? 'average' as const : requestedAggregation(clause);
    if (aggregation === 'average' && !/\b(?:avg|average|mean)\b/.test(clause)) aggregation = defaultAggregation;
    // activityCount is already a per-day quantity. "How many exercises" asks
    // for its sum; count is reserved for observed day/record counts.
    if (aggregation === 'count' && field === 'activityCount' && !/\b(?:day|days|dates|entries|records)\b/.test(clause)) aggregation = 'sum';
    return { field, aggregation, label: FIELD_LABELS[field] };
  });
  // A percentage over a continuous score is undefined without a predicate such
  // as pain >= 7. Refuse to invent a >0 predicate; a planner with predicates can
  // support that explicitly in a later contract version.
  if (measures.some(measure => measure.aggregation === 'percentage' && measure.field !== 'ptSession' && measure.field !== 'trainingSession')) return null;
  const groupBy: AiAnalyticsGroup = analysis === 'correlation' ? 'overall'
    : scopes.length > 1 ? 'scope'
    : /\b(?:workout|exercise|active)\s+(?:versus|vs\.?|compared (?:with|to))\s+(?:rest|inactive)|\brest\s+(?:versus|vs\.?|compared (?:with|to))\s+(?:workout|exercise|active)\b/.test(source)
    ? 'activityState'
    : /\b(?:pt|training|session)\s+(?:versus|vs\.?|compared (?:with|to))\b|\b(?:session type|session kind)\b/.test(source) ? 'sessionKind'
      : /\b(?:by|per|each|every|group(?:ed)? by)\s+month|\bmonthly\b/.test(source) ? 'month'
        : /\b(?:by|per|each|every|group(?:ed)? by)\s+week|\bweekly\b/.test(source) ? 'week'
          : measures.some(measure => measure.aggregation === 'longestStreak') || /\boverall\b/.test(source) || !/\b(?:daily|by day|per day|each day|trend|over time|chart|graph|plot)\b/.test(source) ? 'overall' : 'day';
  const visual: AiAnalyticsPlan['visual'] = analysis === 'correlation' || /\btable\b/.test(source) || groupBy === 'overall' || groupBy === 'scope' ? 'table'
    : /\bbar(?: graph| chart)?\b/.test(source) || groupBy === 'activityState' || groupBy === 'sessionKind' ? 'bar' : 'line';
  return {
    version: 1,
    title: text(question.replace(/\b(?:show|make|create|give me|please)\b/gi, ''), 120) || 'Saved data analysis',
    analysis,
    measures,
    groupBy,
    visual,
    missingData: 'exclude',
    requestedCoverage: {
      observedCount: /\b(?:recorded|observed|logged)\s+(?:day|days|value|values)|\bhow many\s+(?:day|days|dates|entries|records)\b/i.test(question),
      missingCount: /\b(?:missing|unlogged|not logged|not recorded)\b/i.test(question),
    },
    scopes: scopes.length > 1 ? scopes.slice(0, 8) : undefined,
  };
}

function parseDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function groupLabel(record: HistoryDayRecord, group: AiAnalyticsGroup, scopes: NamedHistoryWindow[] = []) {
  if (group === 'scope') return scopes.find(scope => record.date >= scope.startDate && record.date <= scope.endDate)?.label ?? null;
  if (group === 'day') return record.date;
  if (group === 'month') return record.date.slice(0, 7);
  if (group === 'activityState') return uniqueActivityCount(record) > 0 ? 'Exercise/activity recorded' : 'No exercise/activity recorded';
  if (group === 'sessionKind') return record.session?.kind === 'pt' ? 'PT session' : record.session?.kind === 'training' ? 'Training session' : 'No PT/training session';
  if (group === 'overall') return 'All analyzed days';
  const date = parseDate(record.date);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return `Week of ${dateString(date)}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function aggregate(values: number[], aggregation: AiAnalyticsAggregation, datedValues: Array<{ date: string; value: number }>) {
  if (!values.length) return null;
  if (aggregation === 'count') return values.length;
  if (aggregation === 'sum') return round(values.reduce((sum, value) => sum + value, 0));
  if (aggregation === 'minimum') return Math.min(...values);
  if (aggregation === 'maximum') return Math.max(...values);
  if (aggregation === 'percentage') return round((values.filter(value => value > 0).length / values.length) * 100);
  if (aggregation === 'median') {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
  }
  if (aggregation === 'longestStreak') {
    const positives = datedValues.filter(item => item.value > 0).sort((left, right) => left.date.localeCompare(right.date));
    let longest = 0;
    let current = 0;
    let previous = '';
    for (const item of positives) {
      const expected = previous ? dateString(new Date(parseDate(previous).getTime() + 86_400_000)) : '';
      current = previous && item.date === expected ? current + 1 : 1;
      longest = Math.max(longest, current);
      previous = item.date;
    }
    return longest;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function display(value: number | null) {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function executeAiAnalyticsPlan(plan: AiAnalyticsPlan, records: HistoryDayRecord[]): AiAnalyticsResult | null {
  const sortedRecords = [...records].sort((left, right) => left.date.localeCompare(right.date));
  if (!sortedRecords.length) return null;
  if (plan.analysis === 'correlation') {
    const [leftMeasure, rightMeasure] = plan.measures;
    const pairs: Array<{ date: string; left: number; right: number }> = [];
    let missingValues = 0;
    let leftObserved = 0;
    let rightObserved = 0;
    for (const record of sortedRecords) {
      const leftRaw = fieldValue(record, leftMeasure.field);
      const rightRaw = fieldValue(record, rightMeasure.field);
      if (leftRaw === null) missingValues += 1;
      else leftObserved += 1;
      if (rightRaw === null) missingValues += 1;
      else rightObserved += 1;
      if (plan.missingData === 'zero') pairs.push({ date: record.date, left: leftRaw ?? 0, right: rightRaw ?? 0 });
      else if (leftRaw !== null && rightRaw !== null) pairs.push({ date: record.date, left: leftRaw, right: rightRaw });
    }
    const leftMean = pairs.length ? pairs.reduce((sum, pair) => sum + pair.left, 0) / pairs.length : 0;
    const rightMean = pairs.length ? pairs.reduce((sum, pair) => sum + pair.right, 0) / pairs.length : 0;
    const numerator = pairs.reduce((sum, pair) => sum + ((pair.left - leftMean) * (pair.right - rightMean)), 0);
    const leftVariance = pairs.reduce((sum, pair) => sum + ((pair.left - leftMean) ** 2), 0);
    const rightVariance = pairs.reduce((sum, pair) => sum + ((pair.right - rightMean) ** 2), 0);
    const coefficient = pairs.length >= 5 && leftVariance > 0 && rightVariance > 0
      ? round(numerator / Math.sqrt(leftVariance * rightVariance))
      : null;
    const startDate = sortedRecords[0].date;
    const endDate = sortedRecords.at(-1)?.date;
    const range = `${startDate} through ${endDate}`;
    const missingDescription = plan.missingData === 'zero' ? 'treated as zero' : 'excluded unless both measures were observed';
    const pairLabel = `${leftMeasure.label} vs ${rightMeasure.label}`;
    const visualization: AiVisualization = {
      id: 'server-analytics-correlation', type: 'table', title: plan.title,
      subtitle: `${sortedRecords.length} days checked · ${range}`,
      columns: ['Measure pair', 'Pearson correlation', 'Paired days'],
      rows: [[pairLabel, display(coefficient), String(pairs.length)]],
      footnote: `Server-calculated Pearson correlation. Missing values were ${missingDescription}. At least five paired days are required; fewer pairs are reported as insufficient. Correlation describes association, not causation.`,
      drilldowns: [{
        label: pairLabel,
        items: pairs.slice(0, 120).map(pair => ({
          sourceId: `analytics:${pair.date}`, date: pair.date, source: 'Saved daily records',
          excerpt: `${leftMeasure.label}: ${pair.left} · ${rightMeasure.label}: ${pair.right}`,
          match: pairLabel, count: 1,
        })),
      }],
    };
    return {
      plan,
      visualization,
      coverage: {
        startDate,
        endDate,
        analyzedDays: sortedRecords.length,
        observedValues: leftObserved + rightObserved,
        missingValues,
        missingData: plan.missingData,
        measures: [
          { field: leftMeasure.field, observedValues: leftObserved, missingValues: sortedRecords.length - leftObserved },
          { field: rightMeasure.field, observedValues: rightObserved, missingValues: sortedRecords.length - rightObserved },
        ],
      },
      evidenceLedger: {
        operation: 'structured-analytics',
        scope: { startDate, endDate, analyzedDays: sortedRecords.length },
        sourceRecordIds: sortedRecords.map(record => `day:${record.date}`),
        filters: ['Include paired dates with both measures observed'],
        grouping: 'overall',
        calculations: [{ field: leftMeasure.field, aggregation: leftMeasure.aggregation, formula: `Pearson correlation(${leftMeasure.field}, ${rightMeasure.field}) over paired dates` }],
        missingDataPolicy: plan.missingData,
        assumptions: ['Correlation describes association and does not establish causation.', plan.missingData === 'zero' ? 'The request explicitly chose to treat unlogged values as zero.' : 'Dates missing either measure are excluded from the paired calculation.'],
      },
    };
  }
  if (plan.groupBy === 'scope' && (!plan.scopes || plan.scopes.length < 2)) return null;
  const groups = new Map<string, HistoryDayRecord[]>();
  for (const scope of plan.scopes ?? []) groups.set(scope.label, []);
  for (const record of sortedRecords) {
    const label = groupLabel(record, plan.groupBy, plan.scopes);
    if (!label) continue;
    groups.set(label, [...(groups.get(label) ?? []), record]);
  }
  const labels = Array.from(groups.keys());
  let observedValues = 0;
  let missingValues = 0;
  const measureCoverage = plan.measures.map(measure => ({ field: measure.field, observedValues: 0, missingValues: 0 }));
  const valuesByMeasure = plan.measures.map((measure, measureIndex) => labels.map(label => {
    const groupRecords = groups.get(label) ?? [];
    const datedValues: Array<{ date: string; value: number }> = [];
    for (const record of groupRecords) {
      const raw = fieldValue(record, measure.field);
      if (raw === null) {
        missingValues += 1;
        measureCoverage[measureIndex].missingValues += 1;
        if (plan.missingData === 'zero') datedValues.push({ date: record.date, value: 0 });
      } else {
        observedValues += 1;
        measureCoverage[measureIndex].observedValues += 1;
        datedValues.push({ date: record.date, value: raw });
      }
    }
    return aggregate(datedValues.map(item => item.value), measure.aggregation, datedValues);
  }));
  const range = `${sortedRecords[0].date} through ${sortedRecords.at(-1)?.date}`;
  const missingDescription = plan.missingData === 'zero' ? 'treated as zero' : plan.missingData === 'labelMissing' ? 'labeled as missing' : 'excluded from calculations';
  const footnote = `Server-calculated from ${sortedRecords.length} analyzed day${sortedRecords.length === 1 ? '' : 's'} (${range}). Missing values were ${missingDescription}; zero and unlogged remain distinct unless zero was explicitly requested.`;
  const drilldowns = labels.map(label => ({
    label,
    items: (groups.get(label) ?? []).slice(0, 120).map(record => ({
      sourceId: `analytics:${record.date}`,
      date: record.date,
      source: 'Saved daily records',
      excerpt: plan.measures.map(measure => `${FIELD_LABELS[measure.field]}: ${fieldValue(record, measure.field) ?? 'unlogged'}`).join(' · '),
      match: label,
      count: 1,
    })),
  }));
  const subtitle = `${sortedRecords.length} day${sortedRecords.length === 1 ? '' : 's'} checked · ${range}`;
  const visualization: AiVisualization = plan.visual === 'table'
    ? {
      id: 'server-analytics-table', type: 'table', title: plan.title, subtitle,
      columns: ['Group', ...plan.measures.map(measure => measure.label)],
      rows: labels.map((label, labelIndex) => [label, ...valuesByMeasure.map(values => display(values[labelIndex]))]),
      footnote, drilldowns,
    }
    : {
      id: 'server-analytics-chart', type: plan.visual, title: plan.title, subtitle, labels,
      series: plan.measures.map((measure, index) => ({
        name: measure.label,
        values: valuesByMeasure[index],
        unit: measure.aggregation === 'percentage' ? '%' : measure.aggregation === 'longestStreak' ? 'days' : FIELD_UNITS[measure.field],
      })),
      yLabel: plan.measures.some(measure => measure.aggregation === 'percentage') ? 'Percent' : 'Calculated value',
      footnote, drilldowns,
    };
  return {
    plan,
    visualization,
    coverage: {
      startDate: sortedRecords[0].date,
      endDate: sortedRecords.at(-1)?.date,
      analyzedDays: sortedRecords.length,
      observedValues,
      missingValues,
      missingData: plan.missingData,
      measures: measureCoverage,
    },
    evidenceLedger: {
      operation: 'structured-analytics',
      scope: { startDate: sortedRecords[0].date, endDate: sortedRecords.at(-1)?.date, analyzedDays: sortedRecords.length },
      sourceRecordIds: sortedRecords.map(record => `day:${record.date}`),
      filters: [],
      grouping: plan.groupBy,
      calculations: plan.measures.map(measure => ({
        field: measure.field,
        aggregation: measure.aggregation,
        formula: measure.aggregation === 'average' ? 'sum(observed values) / observed value count'
          : measure.aggregation === 'percentage' ? 'positive observed values / observed value count × 100'
            : measure.aggregation === 'median' ? 'middle observed value, or mean of the two middle values'
              : measure.aggregation === 'longestStreak' ? 'longest run of consecutive calendar dates with a positive value'
                : `${measure.aggregation}(observed values)`,
      })),
      missingDataPolicy: plan.missingData,
      assumptions: [
        'A recorded activity day has at least one completed exercise or saved exercise metric.',
        plan.missingData === 'zero' ? 'The request explicitly chose to treat unlogged measure values as zero.' : 'Unlogged measure values are not treated as zero.',
      ],
    },
  };
}

function valueWithUnit(value: string, field: AiAnalyticsField, aggregation: AiAnalyticsAggregation) {
  if (value === '—') return 'unavailable';
  const unit = aggregation === 'percentage' ? '%' : aggregation === 'longestStreak' ? ' days' : FIELD_UNITS[field] ?? '';
  return unit === '%' ? `${value}%` : `${value}${unit ? ` ${unit}` : ''}`;
}

/** Compose factual analytical output directly from server-calculated values. */
export function composeAiAnalyticsAnswer(result: AiAnalyticsResult) {
  if (result.visualization.type !== 'table') {
    const series = result.visualization.series.map(item => `${item.name}: ${result.visualization.type === 'line' || result.visualization.type === 'bar' ? result.visualization.labels.map((label, index) => `${label} ${item.values[index] ?? 'unavailable'}`).join('; ') : ''}`);
    const coverage = result.coverage.measures.map(item => `${FIELD_LABELS[item.field]} had ${item.observedValues} recorded day${item.observedValues === 1 ? '' : 's'} and ${item.missingValues} unlogged day${item.missingValues === 1 ? '' : 's'}`).join('; ');
    return `I calculated this directly from your saved records. ${series.join(' ')} ${coverage}. Missing values were ${result.plan.missingData === 'zero' ? 'treated as zero' : 'excluded, not treated as zero'}.`.trim();
  }
  const rows = result.visualization.rows;
  if (!rows.length) return 'I checked the requested saved records, but there were no observed values available for this calculation.';
  if (result.plan.analysis === 'correlation') {
    const row = rows[0];
    return row[1] === '—'
      ? `There were ${row[2]} paired saved days for ${row[0]}. At least five paired days with variation are required for a meaningful server-calculated correlation, so I am not presenting a coefficient.`
      : `The server-calculated Pearson correlation for ${row[0]} was ${row[1]} across ${row[2]} paired saved days. Correlation describes association, not causation.`;
  }

  const sentences = rows.flatMap(row => result.plan.measures.map((measure, index) => {
    const value = String(row[index + 1] ?? '—');
    return `${measure.label} for ${row[0]} was ${valueWithUnit(value, measure.field, measure.aggregation)}.`;
  }));
  if (rows.length === 2 && result.plan.measures.length === 1) {
    const current = Number(rows[0][1]);
    const baseline = Number(rows[1][1]);
    if (Number.isFinite(current) && Number.isFinite(baseline)) {
      const difference = round(current - baseline);
      const direction = difference === 0 ? 'the same as' : difference > 0 ? 'higher than' : 'lower than';
      const magnitude = difference === 0 ? '' : ` by ${Math.abs(difference)}`;
      sentences.push(`The current period was ${direction} the previous period${magnitude}.`);
    }
  }
  const coverage = result.coverage.measures.map(item => `${FIELD_LABELS[item.field]} had ${item.observedValues} recorded day${item.observedValues === 1 ? '' : 's'} and ${item.missingValues} unlogged day${item.missingValues === 1 ? '' : 's'}.`);
  return [...sentences, ...coverage, `Missing values were ${result.plan.missingData === 'zero' ? 'treated as zero.' : 'excluded from the calculation, not treated as zero.'}`].join(' ');
}

export const AI_ANALYTICS_PLAN_CONTRACT = {
  rule: 'Return calculation instructions only. The server calculates every personal-data value and rejects unsupported fields or operations.',
  fields: Object.keys(FIELD_LABELS),
  aggregations: ['average', 'sum', 'minimum', 'maximum', 'median', 'count', 'percentage', 'longestStreak'],
  groupBy: ['day', 'week', 'month', 'overall', 'activityState', 'sessionKind'],
  visuals: ['table', 'line', 'bar'],
  missingData: ['exclude', 'zero', 'labelMissing'],
  analyses: ['aggregate', 'correlation'],
  shape: { analyticsPlan: { version: 1, title: '', analysis: 'aggregate', measures: [{ field: '', aggregation: '', label: '' }], groupBy: '', visual: '', missingData: '' } },
} as const;
