import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { buildBoundedHistoryComparison, buildExerciseCompletionCoverage, buildWholeHistoryComparison, recordsForVisualization, recordsForWindow, resolveHistoryWindowFromConversation, strongFallbackDays, supportedDateLinkDates } from './aiHistoryScope.ts';
import type { HistoryDayRecord, RankedHistoryDay } from './historyRanking.ts';

function day(date: string, health: Record<string, unknown> | null = null): HistoryDayRecord {
  return { date, completed: [], exerciseNotes: [], health, session: null };
}

test('whole-history comparison contains one bounded row for every loaded day', () => {
  const comparison = buildWholeHistoryComparison([
    day('2026-07-01', { pain: 6, energy: 4, generalNote: 'A'.repeat(200) }),
    day('2026-07-02', { pain: 4, energy: 5 }),
  ]);

  assert.equal(comparison.coversEveryLoadedDay, true);
  assert.equal(comparison.dayCount, 2);
  assert.equal(comparison.rows.length, 2);
  assert.equal(String(comparison.rows[0][9]).length, 120);
});

test('date tiles are supported only by dates cited in the answer or explicitly requested', () => {
  const supported = supportedDateLinkDates('The strongest day was 2026-07-12.', ['2026-07-02']);
  assert.deepEqual([...supported], ['2026-07-12', '2026-07-02']);
  assert.equal(supported.has('2026-06-30'), false);
});

test('degraded fallback excludes merely related-looking days', () => {
  const ranked: RankedHistoryDay[] = [
    { ...day('2026-07-01'), score: 1, evidence: ['Matched "heel" in health notes'] },
    { ...day('2026-07-02'), score: 2, evidence: ['Exact phrase matched in exercise notes'] },
    { ...day('2026-07-03'), score: 3, evidence: ['Explicitly referenced date'] },
  ];
  assert.deepEqual(strongFallbackDays(ranked, []).map(item => item.date), ['2026-07-02', '2026-07-03']);
});

test('resolves complete relative windows and carries them through correction follow-ups', () => {
  const current = resolveHistoryWindowFromConversation('Look harder', [
    'What exercises did I not do during the past five days?',
  ], '2026-07-15');
  assert.deepEqual(current, {
    startDate: '2026-07-10',
    endDate: '2026-07-14',
    dayCount: 5,
    sourceText: 'past five days',
  });

  const includingToday = resolveHistoryWindowFromConversation('Show the last 3 days including today', [], '2026-07-15');
  assert.deepEqual(includingToday && [includingToday.startDate, includingToday.endDate], ['2026-07-13', '2026-07-15']);
});

test('bounded comparisons include empty calendar days instead of sampling saved days', () => {
  const window = resolveHistoryWindowFromConversation('past 5 days', [], '2026-07-15');
  assert(window);
  const records = recordsForWindow([
    { ...day('2026-07-12'), completed: ['Bike'] },
    { ...day('2026-07-14'), completed: ['Calf Stretch'] },
  ], window);
  assert.deepEqual(records.map(record => record.date), ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14']);
  const comparison = buildBoundedHistoryComparison(records, window);
  assert.equal(comparison.coversEveryCalendarDay, true);
  assert.equal(comparison.rows.length, 5);
  assert.deepEqual(comparison.rows[2][1], ['Bike']);
});

test('visual scope keeps complete data only when requested and otherwise uses the readable recent default', () => {
  const records = Array.from({ length: 47 }, (_, index) => day(`2026-06-${String(index + 1).padStart(2, '0')}`));
  assert.equal(recordsForVisualization(records, null, false).length, 14);
  assert.equal(recordsForVisualization(records, null, true).length, 47);

  const window = { startDate: records[0].date, endDate: records[4].date, dayCount: 5, sourceText: 'past five days' };
  assert.equal(recordsForVisualization(records, window, true).length, 5);
});

test('completion coverage uses current tracker ids and counts metrics as activity', () => {
  const records: HistoryDayRecord[] = [
    {
      ...day('2026-07-12'),
      workoutEntries: [{ exerciseId: 'bike', exercise: 'Bike', completed: true }],
      exerciseMetrics: [{ exerciseId: 'calf', exercise: 'Calf Raise', sets: 3, reps: 10, durationSeconds: null, weight: null, weightUnit: 'lb', scopeMultiplier: 1 }],
    },
  ];
  const coverage = buildExerciseCompletionCoverage(records, [
    { id: 'bike', name: 'Bike' },
    { id: 'calf', name: 'Calf Raise' },
    { id: 'balance', name: 'Balance' },
  ]);
  assert.deepEqual(coverage.performedNames, ['Bike', 'Calf Raise']);
  assert.deepEqual(coverage.missedNames, ['Balance']);
  assert.equal(coverage.trackerExerciseCount, 3);
});
