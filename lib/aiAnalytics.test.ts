import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { aiAnalyticsNeedsDerivedEvents, executeAiAnalyticsPlan, inferAiAnalyticsPlan, normalizeAiAnalyticsPlan } from './aiAnalytics.ts';
import type { HistoryDayRecord } from './historyRanking.ts';

function day(date: string, pain: number | null, sleepHours: number | null, completed: string[] = [], session: HistoryDayRecord['session'] = null): HistoryDayRecord {
  return {
    date,
    completed,
    exerciseNotes: [],
    health: pain === null && sleepHours === null ? null : { pain, sleepHours },
    session,
    workoutEntries: completed.map((exercise, index) => ({ exerciseId: String(index), exercise, completed: true })),
    exerciseMetrics: [],
  };
}

const records = [
  day('2026-07-01', 6, 6, ['Bike']),
  day('2026-07-02', null, 8),
  day('2026-07-03', 3, 7, ['Walk'], { kind: 'pt', note: '' }),
  day('2026-07-08', 5, null, ['Bike', 'Walk']),
];

test('normalizes calculation instructions but ignores model-supplied numeric values', () => {
  const plan = normalizeAiAnalyticsPlan({ analyticsPlan: {
    title: 'Weekly pain',
    measures: [{ field: 'pain', aggregation: 'average', label: 'Average pain', values: [999] }],
    groupBy: 'week', visual: 'bar', missingData: 'exclude', rows: [['invented', 999]],
  } });
  assert.ok(plan);
  assert.equal('values' in plan.measures[0], false);
  const result = executeAiAnalyticsPlan(plan, records);
  assert.equal(result?.visualization.type, 'bar');
  assert.deepEqual(result?.visualization.type === 'bar' ? result.visualization.series[0].values : [], [4.5, 5]);
  assert.deepEqual(result?.evidenceLedger.sourceRecordIds, records.map(record => `day:${record.date}`));
  assert.equal(result?.evidenceLedger.calculations[0].formula, 'sum(observed values) / observed value count');
});

test('missing values stay distinct from zero unless zero is explicitly requested', () => {
  const exclude = normalizeAiAnalyticsPlan({ title: 'Pain', measures: [{ field: 'pain', aggregation: 'average' }], groupBy: 'overall', visual: 'table', missingData: 'exclude' });
  const zero = normalizeAiAnalyticsPlan({ title: 'Pain', measures: [{ field: 'pain', aggregation: 'average' }], groupBy: 'overall', visual: 'table', missingData: 'zero' });
  assert.ok(exclude && zero);
  const excluded = executeAiAnalyticsPlan(exclude, records);
  const zeroed = executeAiAnalyticsPlan(zero, records);
  assert.deepEqual(excluded?.visualization.type === 'table' ? excluded.visualization.rows[0] : [], ['All analyzed days', '4.67']);
  assert.deepEqual(zeroed?.visualization.type === 'table' ? zeroed.visualization.rows[0] : [], ['All analyzed days', '3.5']);
  assert.equal(excluded?.coverage.missingValues, 1);
});

test('calculates workout-versus-rest comparisons on the server', () => {
  const plan = inferAiAnalyticsPlan('Compare my average pain on workout versus rest days as a bar chart');
  assert.ok(plan);
  assert.equal(plan.groupBy, 'activityState');
  const result = executeAiAnalyticsPlan(plan, records);
  assert.equal(result?.visualization.type, 'bar');
  assert.deepEqual(result?.visualization.type === 'bar' ? result.visualization.labels : [], ['Exercise/activity recorded', 'No exercise/activity recorded']);
  assert.deepEqual(result?.visualization.type === 'bar' ? result.visualization.series[0].values : [], [4.67, null]);
});

test('calculates longest recorded-activity streak without treating a gap as consecutive', () => {
  const plan = inferAiAnalyticsPlan('Give me a table with my longest exercise streak');
  assert.ok(plan);
  const result = executeAiAnalyticsPlan(plan, records);
  assert.deepEqual(result?.visualization.type === 'table' ? result.visualization.rows[0] : [], ['All analyzed days', '1']);
});

test('rejects unsupported analytics instead of allowing arbitrary model calculations', () => {
  assert.equal(normalizeAiAnalyticsPlan({ analyticsPlan: {
    measures: [{ field: 'diagnosisProbability', aggregation: 'average' }],
    groupBy: 'week', visual: 'line', missingData: 'exclude',
  } }), null);
});

test('calculates correlation from paired saved values and states the causal limitation', () => {
  const plan = inferAiAnalyticsPlan('What is the correlation between my pain and sleep hours?');
  assert.ok(plan);
  assert.equal(plan.analysis, 'correlation');
  const result = executeAiAnalyticsPlan(plan, records);
  assert.equal(result?.visualization.type, 'table');
  assert.equal(result?.visualization.type === 'table' ? result.visualization.rows[0][2] : '', '2');
  assert.match(result?.visualization.footnote ?? '', /not causation/i);
  assert.equal(result?.evidenceLedger.assumptions.some(assumption => /does not establish causation/i.test(assumption)), true);
});

test('does not substitute generic metrics for unsupported anatomy or adherence analytics', () => {
  assert.equal(aiAnalyticsNeedsDerivedEvents('Compare left and right heel pain by week'), true);
  assert.equal(aiAnalyticsNeedsDerivedEvents('Show my weekly exercise adherence'), true);
  assert.equal(inferAiAnalyticsPlan('Compare left and right heel pain by week'), null);
  assert.equal(inferAiAnalyticsPlan('Show my weekly exercise adherence'), null);
  assert.ok(inferAiAnalyticsPlan('Show average pain by week'));
});
