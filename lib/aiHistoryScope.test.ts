import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { buildWholeHistoryComparison, strongFallbackDays, supportedDateLinkDates } from './aiHistoryScope.ts';
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
